// Reference-frame and grid arithmetic. Pure functions, no GL.
//
// Every effect size is expressed in REFERENCE PIXELS: the frame's cover-fit
// world measured as 1920x1080. A 16:9 frame is 1920x1080 reference pixels
// whether the canvas is a 900px preview or a 3840px export, which is the
// property that lets a grid effect produce the same cells at every output
// size. See SPEC-effects.md section 6.

export const REF_WIDTH = 1920;
export const REF_HEIGHT = 1080;

/** Device pixels per reference pixel. 1 at 1920x1080, 2 at 3840x2160. */
export function outputScale(width: number, height: number): number {
  return Math.max(width / REF_WIDTH, height / REF_HEIGHT);
}

/**
 * The frame's size in reference pixels. The dominant axis is returned as the
 * exact constant rather than as width / (width / 1920): that round trip can
 * land on 1919.9999999 or 1920.0000001, and gridFor() takes a ceil of it.
 */
export function refSize(width: number, height: number): [number, number] {
  if (width * REF_HEIGHT >= height * REF_WIDTH) {
    return [REF_WIDTH, (height * REF_WIDTH) / width];
  }
  return [(width * REF_HEIGHT) / height, REF_HEIGHT];
}

export type Grid = {
  cols: number;
  rows: number;
  /** Cell size in reference pixels. */
  cell: [number, number];
  /** Frame size in reference pixels. */
  ref: [number, number];
  /** Output pixels per cell on each axis. Whole numbers mean an exact export. */
  pxPerCell: [number, number];
  /** Rotation of the grid about the frame centre, in radians. 0 unless the
   * effect asked for a lattice. */
  angle: number;
  /** How far an unrotated grid extends past the frame, as a multiple of the
   * frame (>= 1 on each axis). Partial cells at the edges make this exceed 1. */
  extent: [number, number];
};

/**
 * The grid a cell size produces on a frame. Centred on the frame with a cell
 * boundary at the centre, so cols and rows are always even and a different
 * aspect ratio crops the grid evenly. Depends on the frame's aspect ratio
 * and the cell size only, never on its pixel dimensions.
 *
 * Two flavours:
 *
 * - default: cells are whole reference pixels and axis-aligned, so that
 *   1080p-class and 4K-class exports get whole output pixels per cell.
 * - `lattice`: for effects that draw soft, antialiased shapes (halftone).
 *   The grid may be rotated and its pitch need not be whole, since nothing
 *   snaps to pixels; it is sized to cover the rotated frame plus a margin of
 *   two cells, because a shape can spill into its neighbours' cells.
 */
export function gridFor(
  width: number,
  height: number,
  cell: [number, number],
  lattice?: { angle: number },
): Grid {
  const ref = refSize(width, height);
  const s = outputScale(width, height);
  if (!lattice) {
    const nx = Math.max(1, Math.round(cell[0]));
    const ny = Math.max(1, Math.round(cell[1]));
    // The epsilon absorbs float noise in the non-dominant axis so a frame that
    // is an exact multiple of the cell does not gain a phantom extra column.
    const cols = 2 * Math.max(1, Math.ceil(ref[0] / (2 * nx) - 1e-6));
    const rows = 2 * Math.max(1, Math.ceil(ref[1] / (2 * ny) - 1e-6));
    return {
      cols,
      rows,
      cell: [nx, ny],
      ref,
      pxPerCell: [nx * s, ny * s],
      angle: 0,
      extent: [(cols * nx) / ref[0], (rows * ny) / ref[1]],
    };
  }
  const nx = Math.max(0.5, cell[0]);
  const ny = Math.max(0.5, cell[1]);
  const angle = (lattice.angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(angle));
  const sn = Math.abs(Math.sin(angle));
  // Half-extents of the frame's bounding box in the grid's rotated axes.
  const hx = (c * ref[0] + sn * ref[1]) / 2;
  const hy = (sn * ref[0] + c * ref[1]) / 2;
  const cols = 2 * (Math.ceil(hx / nx - 1e-6) + 2);
  const rows = 2 * (Math.ceil(hy / ny - 1e-6) + 2);
  return {
    cols,
    rows,
    cell: [nx, ny],
    ref,
    pxPerCell: [nx * s, ny * s],
    angle,
    extent: [(cols * nx) / ref[0], (rows * ny) / ref[1]],
  };
}

/**
 * How the vertex shader must map the fullscreen quad so that, while rendering
 * INTO a grid's cell buffer, v_uv is each cell's centre in 0-1 frame UV:
 * v_uv = matrix * a_position + offset, with a_position in [-1,1]^2.
 * `cellU` / `cellV` are one cell's edge vectors in frame UV, for passes that
 * spread taps across the cell.
 */
export function gridUvTransform(grid: Grid): {
  matrix: [number, number, number, number];
  offset: [number, number];
  cellU: [number, number];
  cellV: [number, number];
} {
  const c = Math.cos(grid.angle);
  const s = Math.sin(grid.angle);
  const [nx, ny] = grid.cell;
  const [rx, ry] = grid.ref;
  // Column-major mat2: column 0 is where a_position.x = 1 lands (half the
  // grid's width along its own x axis), column 1 likewise for y.
  const hx = (grid.cols * nx) / 2;
  const hy = (grid.rows * ny) / 2;
  return {
    matrix: [(c * hx) / rx, (s * hx) / ry, (-s * hy) / rx, (c * hy) / ry],
    offset: [0.5, 0.5],
    cellU: [(c * nx) / rx, (s * nx) / ry],
    cellV: [(-s * ny) / rx, (c * ny) / ry],
  };
}
