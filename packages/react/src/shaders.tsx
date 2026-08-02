"use client";

import type { ReactElement } from "react";
import { flow, beam } from "instantshader";
import { ShaderCanvas } from "./ShaderCanvas";
import type { ShaderCanvasProps } from "./ShaderCanvas";

export function Flow(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={flow} {...props} />;
}

export function Beam(props: Omit<ShaderCanvasProps, "shader">): ReactElement {
  return <ShaderCanvas shader={beam} {...props} />;
}
