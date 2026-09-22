// Low-level WebGL1 helpers shared by the stack renderer: shader compile/link,
// a program wrapper with cached uniform lookups, and render-to-texture
// targets. Nothing in here knows about shaders, effects or palettes.

/** Compiles one shader stage, logging the info log and throwing on failure
 * so a broken def fails loudly at mount time instead of rendering a blank
 * canvas. */
export function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("[instantshader] gl.createShader returned null");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    console.error("[instantshader] shader compile error:", info);
    throw new Error(`[instantshader] shader compile error: ${info}`);
  }
  return shader;
}

/** Links a vertex + fragment shader pair into a program, logging and
 * throwing on link failure (e.g. varying mismatch between stages). */
export function linkProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("[instantshader] gl.createProgram returned null");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  // Every program in a stack shares one quad buffer, so a_position is pinned
  // to location 0 instead of being looked up and re-pointed per program.
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    // Delete the shaders too, not just the program: they were only flagged
    // for deletion (deleteShader is a no-op while still attached), and the
    // caller never reaches its own post-link deleteShader calls because
    // this throws before returning.
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteProgram(program);
    console.error("[instantshader] program link error:", info);
    throw new Error(`[instantshader] program link error: ${info}`);
  }
  return program;
}

/** A linked program plus a uniform-location cache. Locations are looked up
 * on first use: most programs only declare a fraction of the uniforms the
 * stack offers them, and a null location is a legal no-op for gl.uniform*. */
export type Program = {
  program: WebGLProgram;
  loc(name: string): WebGLUniformLocation | null;
  dispose(): void;
};

export function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): Program {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = linkProgram(gl, vs, fs);
  // Shader objects are refcounted by the program once linked; flag them for
  // deletion now so they're freed as soon as the program itself is deleted.
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const locs = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    loc(name) {
      let l = locs.get(name);
      if (l === undefined) {
        l = gl.getUniformLocation(program, name);
        locs.set(name, l);
      }
      return l;
    },
    dispose() {
      gl.deleteProgram(program);
    },
  };
}

/** A texture with a framebuffer attached, i.e. something a pass can draw
 * into and a later pass can sample. */
export type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

/**
 * Creates an RGBA8 render target. RGBA8 is the one format WebGL1 guarantees
 * is renderable. NPOT sizes are the norm here, which WebGL1 only allows with
 * CLAMP_TO_EDGE and no mipmaps.
 */
export function createTarget(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  filter: "nearest" | "linear",
): Target {
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const limit = Math.min(maxTex, maxRb);
  if (width > limit || height > limit) {
    throw new Error(
      `[instantshader] a ${width}x${height} render target exceeds this GPU's limit of ${limit}px ` +
        `(MAX_TEXTURE_SIZE ${maxTex}, MAX_RENDERBUFFER_SIZE ${maxRb})`,
    );
  }

  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    throw new Error("[instantshader] failed to allocate a render target");
  }
  const f = filter === "nearest" ? gl.NEAREST : gl.LINEAR;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    throw new Error(`[instantshader] ${width}x${height} framebuffer incomplete (status 0x${status.toString(16)})`);
  }

  return { texture, framebuffer, width, height };
}

export function deleteTarget(gl: WebGLRenderingContext, target: Target | null): void {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
}
