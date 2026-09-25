// Table coral (Acropora hyacinthus / cytherea): a broad, thin horizontal plate
// on a short central stalk, its upper surface a carpet of tiny branchlets.

import * as THREE from 'three';
import { SimplexNoise } from '../../util/noise.js';
import { proceduralSurface } from '../materials.js';
import { underwater } from '../../water/underwater.js';

const PALETTES = {
  sage: { top: '#b8c690', rim: '#f4fae0', under: '#9a9a78', stalk: '#9a8a68' },
  tan: { top: '#a08a5a', rim: '#f0e6c8', under: '#4f4232', stalk: '#6a5a40' },
  teal: { top: '#5f8f8a', rim: '#d0fff4', under: '#2f4442', stalk: '#50584a' },
};

export function createTableCoral({ radius = 0.8, seed = 4, palette = 'sage', stalkHeight = 0.35, rings = 26, sectors = 96 } = {}) {
  const noise = new SimplexNoise(seed);
  const pal = Object.fromEntries(Object.entries(PALETTES[palette]).map(([k, v]) => [k, new THREE.Color(v)]));
  const RS = rings, AS = sectors;
  const edge = (a) => radius * (1 + 0.14 * noise.noise3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0.5) + 0.05 * noise.noise3(Math.cos(a) * 4, Math.sin(a) * 4, 2));
  // Plate height profile: slightly domed centre, gently up-turned rim.
  const surf = (r, R, a) => {
    const t = r / R;
    return stalkHeight + 0.03 * (1 - t * t) + 0.05 * Math.pow(t, 3) + 0.02 * noise.noise3(Math.cos(a) * 2 * t, Math.sin(a) * 2 * t, 7);
  };
  const thick = (r, R) => 0.012 + 0.03 * (1 - r / R);
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };
  // Top surface grid + bottom grid
  const top = [], bot = [];
  for (let i = 0; i <= RS; i++) {
    top.push([]);
    bot.push([]);
    for (let j = 0; j < AS; j++) {
      const a = (j / AS) * Math.PI * 2;
      const R = edge(a);
      const r = (i / RS) * R;
      const y = surf(r, R, a);
      const c = new THREE.Color().lerpColors(pal.top, pal.rim, Math.pow(i / RS, 6));
      top[i].push(push(Math.cos(a) * r, y, Math.sin(a) * r, c));
      bot[i].push(push(Math.cos(a) * r, y - thick(r, R), Math.sin(a) * r, pal.under));
    }
  }
  for (let i = 0; i < RS; i++) {
    for (let j = 0; j < AS; j++) {
      const j2 = (j + 1) % AS;
      idx.push(top[i][j], top[i][j2], top[i + 1][j], top[i][j2], top[i + 1][j2], top[i + 1][j]);
      idx.push(bot[i][j], bot[i + 1][j], bot[i][j2], bot[i][j2], bot[i + 1][j], bot[i + 1][j2]);
    }
  }
  // Rim wall
  for (let j = 0; j < AS; j++) {
    const j2 = (j + 1) % AS;
    idx.push(top[RS][j], top[RS][j2], bot[RS][j], top[RS][j2], bot[RS][j2], bot[RS][j]);
  }
  const plate = new THREE.BufferGeometry();
  plate.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  plate.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  plate.setIndex(idx);
  plate.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  underwater(mat);
  proceduralSurface(mat, {
    key: 'table',
    uniforms: { uBranchlet: { value: 90.0 } },
    glsl: /* glsl */ `
      float surfH(vec3 p) {
        vec2 c = cellular(vec3(p.x, p.y * 0.3, p.z) * uBranchlet);
        return smoothstep(0.7, 0.1, c.x) * 0.004;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        vec2 c = cellular(vec3(p.x, p.y * 0.3, p.z) * uBranchlet);
        float tip = smoothstep(0.35, 0.05, c.x);
        vec3 col = base * (0.7 + 0.45 * tip);
        col *= 0.9 + 0.2 * snoise(p * 3.0);
        return col;
      }
    `,
  });
  const group = new THREE.Group();
  group.name = 'tableCoral';
  const plateMesh = new THREE.Mesh(plate, mat);
  plateMesh.castShadow = true;
  plateMesh.receiveShadow = true;
  group.add(plateMesh);

  // Stalk
  const stalkGeo = new THREE.CylinderGeometry(radius * 0.08, radius * 0.16, stalkHeight + 0.02, 16, 4);
  stalkGeo.translate(0, (stalkHeight + 0.02) / 2 - 0.02, 0);
  const sc = [];
  for (let i = 0; i < stalkGeo.attributes.position.count; i++) sc.push(pal.stalk.r, pal.stalk.g, pal.stalk.b);
  stalkGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const stalk = new THREE.Mesh(stalkGeo, mat);
  stalk.castShadow = true;
  stalk.receiveShadow = true;
  group.add(stalk);
  return group;
}
