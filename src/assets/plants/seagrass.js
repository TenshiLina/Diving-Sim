// Seagrass / ribbon-weed tufts: thin curved blades that stream in the surge.

import * as THREE from 'three';
import { Rng } from '../../util/noise.js';
import { addSway } from '../materials.js';
import { underwater } from '../../water/underwater.js';

const PALETTES = {
  seagrass: { base: '#2d4a18', mid: '#4f7a26', tip: '#a8b84a' },
  kelp: { base: '#3a2a0e', mid: '#6b5a1a', tip: '#b8a040' },
  emerald: { base: '#0f3a22', mid: '#1f7a40', tip: '#8fd070' },
};

/**
 * @param {object} o
 *   blades: number of blades, spread: radius of the tuft, height: mean blade length
 *   width: blade width
 */
export function createSeagrass({ blades = 40, spread = 0.25, height = 0.45, width = 0.012, seed = 9, palette = 'seagrass' } = {}) {
  const rng = new Rng(seed);
  const pal = Object.fromEntries(Object.entries(PALETTES[palette]).map(([k, v]) => [k, new THREE.Color(v)]));
  const pos = [], nrm = [], col = [], sway = [], phase = [], idx = [];
  const SEG = 10;
  for (let b = 0; b < blades; b++) {
    const r = spread * Math.sqrt(rng.next());
    const a = rng.float(0, Math.PI * 2);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const len = height * rng.float(0.55, 1.35);
    const yaw = rng.float(0, Math.PI * 2);
    const lean = rng.float(0.05, 0.4);
    const ph = rng.next();
    const w0 = width * rng.float(0.8, 1.2);
    // Blade faces a random direction; the flat side normal is (cos yaw, 0, sin yaw).
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const sx = -fz, sz = fx; // width direction
    const tint = rng.float(-0.06, 0.06);
    const start = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      // Arc: rises then bends over in the lean direction.
      const y = len * t * (1 - 0.25 * lean * t);
      const off = len * lean * t * t;
      const cx = bx + fx * off, cz = bz + fz * off;
      const w = w0 * (t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1 * 0.9);
      for (const s of [-1, 1]) {
        pos.push(cx + sx * w * 0.5 * s, y, cz + sz * w * 0.5 * s);
        nrm.push(fx, 0.2, fz);
        const c = new THREE.Color();
        if (t < 0.4) c.lerpColors(pal.base, pal.mid, t / 0.4);
        else c.lerpColors(pal.mid, pal.tip, (t - 0.4) / 0.6);
        c.offsetHSL(tint * 0.2, 0, tint);
        col.push(c.r, c.g, c.b);
        sway.push(t);
        phase.push(ph);
      }
    }
    for (let i = 0; i < SEG; i++) {
      const a0 = start + i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  underwater(mat);
  addSway(mat, { amp: height * 0.35, freq: 1.0, stiffness: 1.7, current: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'seagrass';
  return mesh;
}
