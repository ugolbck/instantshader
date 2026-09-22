// Void-and-cluster (Ulichney 1993) blue-noise threshold map, toroidal.
import { writeFileSync } from "node:fs";
const N = 128, SIGMA = 1.9, R = 9;
const size = N * N;
let seed = 0x2545f491;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const K = [];
for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++)
  K.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))]);

function makeState(bits) {
  const energy = new Float64Array(size);
  const st = { bits: Uint8Array.from(bits), energy };
  for (let i = 0; i < size; i++) if (bits[i]) splat(st, i, 1);
  return st;
}
function splat(st, i, sign) {
  const x = i % N, y = (i / N) | 0;
  for (const [dx, dy, w] of K) {
    const xx = (x + dx + N) % N, yy = (y + dy + N) % N;
    st.energy[yy * N + xx] += sign * w;
  }
}
function tightestCluster(st) { // among 1s, max energy
  let best = -1, bv = -Infinity;
  for (let i = 0; i < size; i++) if (st.bits[i] && st.energy[i] > bv) { bv = st.energy[i]; best = i; }
  return best;
}
function largestVoid(st) { // among 0s, min energy
  let best = -1, bv = Infinity;
  for (let i = 0; i < size; i++) if (!st.bits[i] && st.energy[i] < bv) { bv = st.energy[i]; best = i; }
  return best;
}
const set = (st, i, v) => { if (st.bits[i] === v) return; st.bits[i] = v; splat(st, i, v ? 1 : -1); };

// 1. initial binary pattern, ~10% ones, relaxed until stable
const init = new Uint8Array(size);
let ones = 0;
while (ones < size / 10) { const i = (rnd() * size) | 0; if (!init[i]) { init[i] = 1; ones++; } }
const proto = makeState(init);
for (;;) {
  const c = tightestCluster(proto); set(proto, c, 0);
  const v = largestVoid(proto);
  if (v === c) { set(proto, c, 1); break; }
  set(proto, v, 1);
}
const rank = new Int32Array(size).fill(-1);
// 2. phase 1: remove tightest clusters, ranks ones-1 .. 0
let st = makeState(proto.bits);
for (let r = ones - 1; r >= 0; r--) { const c = tightestCluster(st); set(st, c, 0); rank[c] = r; }
// 3. phase 2+3: fill largest voids, ranks ones .. size-1
st = makeState(proto.bits);
for (let r = ones; r < size; r++) { const v = largestVoid(st); set(st, v, 1); rank[v] = r; }

const out = new Uint8Array(size);
for (let i = 0; i < size; i++) out[i] = Math.floor((rank[i] * 256) / size);
writeFileSync(process.argv[2], Buffer.from(out).toString("base64"));
// histogram sanity
const h = new Uint32Array(256); for (const v of out) h[v]++;
console.log("bytes", out.length, "hist min/max", Math.min(...h), Math.max(...h));
