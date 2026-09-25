// Gorgonian sea fan (Annella / Subergorgia style): a planar, reticulated
// network. Points are scattered over a fan-shaped outline and each one grows
// a twig to its nearest lower neighbour (plus a cross-link now and then), so
// branches thicken toward the holdfast and knit into a lace-like mesh.

import * as THREE from 'three';
import { Rng } from '../../util/noise.js';
import { TubeBatch } from '../../util/tube.js';
import { addSway } from '../materials.js';
import { underwater } from '../../water/underwater.js';

const PALETTES = {
  orange: ['#b03a14', '#ff6a2a', '#ffc080'],
  red: ['#7a1414', '#d2342e', '#ff8a7a'],
  purple: ['#4a2060', '#9a4ab4', '#e8b0ff'],
  yellow: ['#7a5a14', '#e0b030', '#fff090'],
};

export function createSeaFan({ height = 1.1, seed = 21, palette = 'orange', density = 520 } = {}) {
  const rng = new Rng(seed);
  const pal = PALETTES[palette].map((c) => new THREE.Color(c));
  const width = height * 1.25;

  // Fan outline: a wide rounded wedge rising from a short stalk.
  const inside = (x, y) => {
    if (y < height * 0.08) return false;
    const t = y / height;
    const half = (width / 2) * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * (t > 0.85 ? Math.sqrt(Math.max(0, 1 - (t - 0.85) / 0.15)) : 1);
    return Math.abs(x) < half && y < height;
  };

  // Blue-noise-ish scatter (rejection with a minimum spacing).
  const minD = Math.sqrt((width * height) / density) * 0.62;
  const pts = [{ x: 0, y: 0.0, parent: -1, kids: 0 }];
  let tries = 0;
  while (pts.length < density && tries < density * 60) {
    tries++;
    const x = rng.float(-width / 2, width / 2);
    const y = rng.float(0, height);
    if (!inside(x, y)) continue;
    let ok = true;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - x, dy = pts[i].y - y;
      if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
    }
    if (ok) pts.push({ x, y, parent: -1, kids: 0 });
  }
  // Stalk points so everything funnels into one holdfast.
  pts.push({ x: 0, y: height * 0.05, parent: -1, kids: 0 });
  pts.sort((a, b) => a.y - b.y);

  // Parent = nearest point below, biased toward the centre line (fans taper
  // into the stalk). Occasional second link makes the net.
  const edges = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    let best = -1, bestD = Infinity, second = -1, secondD = Infinity;
    for (let j = 0; j < i; j++) {
      const q = pts[j];
      if (q.y >= p.y - minD * 0.15) continue;
      const dx = q.x - p.x, dy = q.y - p.y;
      // Penalise sideways links so twigs run mostly outward/upward.
      const d = Math.hypot(dx * 1.25, dy) + Math.abs(q.x) * 0.05;
      if (d < bestD) { second = best; secondD = bestD; best = j; bestD = d; }
      else if (d < secondD) { second = j; secondD = d; }
    }
    if (best < 0) best = 0;
    p.parent = best;
    edges.push([best, i, true]);
    if (second >= 0 && secondD < minD * 2.2 && rng.next() < 0.45) edges.push([second, i, false]);
  }
  // Subtree sizes -> branch thickness.
  const load = new Float32Array(pts.length).fill(1);
  for (let i = pts.length - 1; i > 0; i--) if (pts[i].parent >= 0) load[pts[i].parent] += load[i];

  const batch = new TubeBatch({ aSway: 1, aPhase: 1 });
  const col = (t, j) => {
    const c = new THREE.Color();
    if (t < 0.45) c.lerpColors(pal[0], pal[1], t / 0.45);
    else c.lerpColors(pal[1], pal[2], (t - 0.45) / 0.55);
    c.multiplyScalar(0.9 + j * 0.2);
    return [c.r, c.g, c.b];
  };
  const rMin = height * 0.0022;
  for (const [a, b, main] of edges) {
    const A = pts[a], B = pts[b];
    const r = main ? rMin + height * 0.0013 * Math.pow(load[b], 0.5) : rMin * 0.85;
    const mid = new THREE.Vector3((A.x + B.x) / 2 + rng.gauss(0, minD * 0.08), (A.y + B.y) / 2, rng.gauss(0, height * 0.004));
    const P = [new THREE.Vector3(A.x, A.y, 0), mid, new THREE.Vector3(B.x, B.y, 0)];
    const rr = [Math.min(r * 1.1, height * 0.02), r, r * 0.95];
    const jit = rng.next();
    batch.add(P, rr, {
      radial: r > rMin * 2 ? 6 : 4,
      cap: 'round',
      color: (i) => col(P[i].y / height, jit),
      attr: (name, i) => (name === 'aSway' ? P[i].y / height : 0.5),
    });
  }
  // Holdfast
  batch.add([new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0, height * 0.05, 0)], [height * 0.022, height * 0.016], {
    radial: 8,
    color: () => col(0, 0.5),
    attr: () => 0,
  });

  const geo = batch.toGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  underwater(mat);
  addSway(mat, { amp: height * 0.06, freq: 0.9, stiffness: 1.3, current: 0.0, swapXZ: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'seaFan';
  return mesh;
}
