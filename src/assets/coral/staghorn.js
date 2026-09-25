// Staghorn / branching Acropora colony: recursively branching tapered tubes
// with pale growing tips and per-pixel corallite bumps.

import * as THREE from 'three';
import { Rng } from '../../util/noise.js';
import { TubeBatch } from '../../util/tube.js';
import { proceduralSurface } from '../materials.js';
import { underwater } from '../../water/underwater.js';

const PALETTES = {
  // [base, mid, tip]
  tan: ['#7a5a38', '#c09a68', '#f6eeff'],
  blue: ['#3a6a90', '#6aa0d8', '#d8f2ff'],
  purple: ['#6a4078', '#b07fc8', '#fae6ff'],
  cream: ['#8a7a58', '#d8c89a', '#fffaea'],
};

export function createStaghorn({ seed = 11, size = 1, palette = 'tan', trunks = 9, depth = 4, radial = 7, segLen = 0.025, caps = 'round' } = {}) {
  const rng = new Rng(seed);
  const pal = PALETTES[palette].map((c) => new THREE.Color(c));
  const batch = new TubeBatch({ aTip: 1 });
  const up = new THREE.Vector3(0, 1, 0);

  const colorAt = (tip) => {
    const c = new THREE.Color();
    if (tip < 0.7) c.lerpColors(pal[0], pal[1], tip / 0.7);
    else c.lerpColors(pal[1], pal[2], (tip - 0.7) / 0.3);
    return [c.r, c.g, c.b];
  };

  // tipness: 0 at colony base, 1 at branch tips; driven by generation + position.
  function branch(start, dir, length, r0, gen, tip0) {
    const segs = Math.max(4, Math.round(length / segLen));
    const pts = [];
    const radii = [];
    const p = start.clone();
    const d = dir.clone();
    const r1 = r0 * 0.72;
    for (let i = 0; i <= segs; i++) {
      pts.push(p.clone());
      const t = i / segs;
      radii.push(r0 + (r1 - r0) * t);
      // Gentle upward-curving wander (phototropism).
      d.x += rng.gauss(0, 0.04);
      d.z += rng.gauss(0, 0.04);
      d.addScaledVector(up, 0.03);
      d.normalize();
      p.addScaledVector(d, length / segs);
    }
    const isLeaf = gen >= depth;
    const tipStart = tip0;
    const tipEnd = isLeaf ? 1 : tip0 + (1 - tip0) * 0.45;
    batch.add(pts, radii, {
      radial,
      cap: caps,
      color: (i) => colorAt(tipStart + (tipEnd - tipStart) * (i / segs)),
      attr: (_, i) => tipStart + (tipEnd - tipStart) * (i / segs),
    });
    if (isLeaf) return;
    const kids = rng.int(1, 3);
    for (let k = 0; k < kids; k++) {
      const at = rng.float(0.35, 0.95);
      const idx = Math.min(pts.length - 1, Math.round(at * segs));
      const base = pts[idx];
      const pd = new THREE.Vector3().subVectors(pts[Math.min(idx + 1, pts.length - 1)], pts[Math.max(idx - 1, 0)]).normalize();
      // Rotate the parent direction outward by 25-55 degrees around a random axis.
      const axis = new THREE.Vector3(rng.float(-1, 1), rng.float(-0.3, 0.3), rng.float(-1, 1)).cross(pd).normalize();
      const nd = pd.clone().applyAxisAngle(axis, THREE.MathUtils.degToRad(rng.float(25, 55)));
      nd.y = Math.max(nd.y, 0.1);
      nd.normalize();
      const rr = radii[idx] * 0.88;
      branch(base, nd, length * rng.float(0.55, 0.8), rr, gen + 1, tipStart + (tipEnd - tipStart) * at);
    }
    // The main axis usually continues too.
    const end = pts[pts.length - 1];
    branch(end, d, length * rng.float(0.5, 0.75), r1, gen + 1, tipEnd);
  }

  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rng.float(-0.3, 0.3);
    const tilt = rng.float(0.25, 0.9);
    const dir = new THREE.Vector3(Math.cos(a) * tilt, 1, Math.sin(a) * tilt).normalize();
    const start = new THREE.Vector3(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04);
    branch(start, dir, rng.float(0.2, 0.3), rng.float(0.026, 0.032), 1, 0);
  }

  const geo = batch.toGeometry();
  geo.scale(size, size, size);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  underwater(mat);
  proceduralSurface(mat, {
    key: 'staghorn',
    uniforms: { uCorScale: { value: 180 / size } },
    glsl: /* glsl */ `
      float surfH(vec3 p) {
        vec2 c = cellular(p * uCorScale);
        // Raised cup-shaped corallites.
        float cup = smoothstep(0.55, 0.15, c.x);
        float rim = smoothstep(0.05, 0.25, c.x);
        return cup * rim * 0.0016;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        vec2 c = cellular(p * uCorScale);
        float pore = smoothstep(0.18, 0.05, c.x);
        return base * (0.92 + 0.25 * smoothstep(0.3, 0.6, c.y - c.x)) * (1.0 - 0.35 * pore);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'staghorn';
  return mesh;
}
