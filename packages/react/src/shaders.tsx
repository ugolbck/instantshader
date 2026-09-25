"use client";

import type { ReactElement } from "react";
import { flow, beam, bloom, halo, strata, dune, whorl, silk, nacre, burst, glint } from "instantshader";
import { ShaderCanvas } from "./ShaderCanvas";
import type { ShaderCanvasProps } from "./ShaderCanvas";

export function Flow(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={flow} {...props} />;
}

export function Beam(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={beam} {...props} />;
}

export function Bloom(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={bloom} {...props} />;
}

export function Halo(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={halo} {...props} />;
}

export function Strata(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={strata} {...props} />;
}

export function Dune(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={dune} {...props} />;
}

export function Whorl(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={whorl} {...props} />;
}

export function Silk(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={silk} {...props} />;
}

export function Nacre(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={nacre} {...props} />;
}

export function Burst(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={burst} {...props} />;
}

export function Glint(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={glint} {...props} />;
}
