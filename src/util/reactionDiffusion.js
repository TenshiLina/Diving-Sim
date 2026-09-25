// Gray–Scott reaction–diffusion, run once on the CPU into a small tileable
// texture. With f≈0.0545, k≈0.062 the system settles into the labyrinth
// pattern of brain corals (parameters after Karl Sims' RD tutorial).

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const cache = new Map();

export function labyrinthTexture({ size = 160, iterations = 3200, f = 0.0545, k = 0.062, seed = 7 } = {}) {
  const key = `${size}:${iterations}:${f}:${k}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(seed);
  const n = size * size;
  let A = new Float32Array(n).fill(1);
  let B = new Float32Array(n);
  let A2 = new Float32Array(n);
  let B2 = new Float32Array(n);
  // Random seed blobs.
  for (let s = 0; s < 40; s++) {
    const cx = Math.floor(rand() * size), cy = Math.floor(rand() * size);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = (cx + dx + size) % size, y = (cy + dy + size) % size;
        B[y * size + x] = 1;
      }
  }
  const dA = 1.0, dB = 0.5;
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < size; y++) {
      const ym = ((y - 1 + size) % size) * size, y0 = y * size, yp = ((y + 1) % size) * size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        const i = y0 + x;
        const a = A[i], b = B[i];
        const lapA = -a + 0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
        const lapB = -b + 0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
        const abb = a * b * b;
        A2[i] = a + dA * lapA - abb + f * (1 - a);
        B2[i] = b + dB * lapB + abb - (k + f) * b;
      }
    }
    let t = A; A = A2; A2 = t;
    t = B; B = B2; B2 = t;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, B[i]); hi = Math.max(hi, B[i]); }
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(((B[i] - lo) / (hi - lo)) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}
