// Magnificent sea anemone (Heteractis magnifica) — host of clownfish.
// A flared column topped by an oral disc carpeted with swaying tentacles.

import * as THREE from 'three';
import { Rng } from '../../util/noise.js';
import { TubeBatch } from '../../util/tube.js';
import { addSway } from '../materials.js';
import { underwater } from '../../water/underwater.js';

const PALETTES = {
  classic: { column: '#a02a5a', disc: '#d8b888', tentBase: '#c0b050', tentTip: '#f070b8' },
  green: { column: '#2d6b52', disc: '#9fb872', tentBase: '#8fae5c', tentTip: '#e8ffb8' },
  pink: { column: '#6a1f5a', disc: '#d8a0b0', tentBase: '#e0a8b8', tentTip: '#ffe4f0' },
};

export function createAnemone({ radius = 0.32, seed = 5, palette = 'classic', tentacles = 700, radial = 6, tentacleSegs = 7 } = {}) {
  const rng = new Rng(seed);
  const pal = Object.fromEntries(Object.entries(PALETTES[palette]).map(([k, v]) => [k, new THREE.Color(v)]));
  const group = new THREE.Group();
  group.name = 'anemone';

  // --- Column + oral disc (lathe) ------------------------------------------------
  const colH = radius * 0.45;
  const prof = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Column flares out into the disc rim.
    const r = radius * (0.55 + 0.45 * Math.pow(t, 2.5)) * (1 + 0.05 * Math.sin(t * 9));
    prof.push(new THREE.Vector2(r, t * colH));
  }
  // Disc surface back toward the mouth
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(radius * (1 - t) + 0.001, colH + 0.012 * Math.sin(t * Math.PI) - 0.01 * t));
  }
  const lathe = new THREE.LatheGeometry(prof, 64);
  // Wavy rim + colours
  const lp = lathe.attributes.position;
  const lc = [];
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    const wobble = 1 + 0.07 * Math.sin(a * 5 + seed) * (y / colH);
    lp.setXYZ(i, x * wobble, y + 0.02 * Math.sin(a * 3 + seed) * (rr / radius) * (y / colH), z * wobble);
    const isDisc = y >= colH - 0.02 && rr < radius * 0.98;
    const c = isDisc ? pal.disc : pal.column.clone().multiplyScalar(0.7 + 0.5 * (y / colH));
    lc.push(c.r, c.g, c.b);
  }
  lathe.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  lathe.computeVertexNormals();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
  underwater(bodyMat);
  const body = new THREE.Mesh(lathe, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // --- Tentacles -------------------------------------------------------------
  const batch = new TubeBatch({ aSway: 1, aPhase: 1 });
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < tentacles; k++) {
    // Phyllotaxis over the disc, denser toward the rim.
    const f = Math.sqrt((k + 0.5) / tentacles);
    const rr = radius * (0.22 + 0.8 * f);
    const a = k * golden;
    const base = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    const rimDrop = Math.pow(rr / radius, 3) * 0.04;
    base.y = colH - 0.004 - rimDrop + 0.01 * Math.sin(a * 3 + seed) * (rr / radius);
    const len = radius * rng.float(0.45, 0.65) * (0.8 + 0.4 * f);
    // Tentacles lean outward, more so at the rim.
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const dir = new THREE.Vector3(rng.gauss(0, 0.15), 1, rng.gauss(0, 0.15)).addScaledVector(out, 0.15 + f * 0.9).normalize();
    const seg = tentacleSegs;
    const pts = [];
    const radii = [];
    const phase = rng.float(0, 1);
    const curl = rng.float(-0.4, 0.4);
    const p = base.clone();
    const d = dir.clone();
    for (let i = 0; i <= seg; i++) {
      pts.push(p.clone());
      const t = i / seg;
      radii.push(len * 0.05 * (1 - 0.3 * t) + 0.0012);
      d.addScaledVector(out, 0.05 + curl * 0.05).addScaledVector(new THREE.Vector3(0, -1, 0), 0.03 * t).normalize();
      p.addScaledVector(d, len / seg);
    }
    const tipC = pal.tentTip;
    const baseC = pal.tentBase.clone().offsetHSL(rng.float(-0.02, 0.02), 0, rng.float(-0.05, 0.05));
    batch.add(pts, radii, {
      radial,
      cap: 'round',
      color: (i, t) => {
        const c = new THREE.Color().lerpColors(baseC, tipC, Math.pow(t, 4) * 0.8);
        return [c.r, c.g, c.b];
      },
      attr: (name, i, t) => (name === 'aSway' ? t : phase),
    });
  }
  const tgeo = batch.toGeometry();
  const tmat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0xfff0e0), sheenRoughness: 0.5 });
  underwater(tmat);
  addSway(tmat, { amp: radius * 0.22, freq: 1.2, stiffness: 1.6, current: 0.2 });
  const tent = new THREE.Mesh(tgeo, tmat);
  tent.castShadow = true;
  tent.receiveShadow = true;
  group.add(tent);
  return group;
}
