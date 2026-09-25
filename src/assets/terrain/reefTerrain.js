// Procedural fringing-reef terrain.
//
// Cross-section (x runs seaward):
//   reef flat (≈2.5 m deep, rough coral pavement with sand pools)
//   → reef crest → spur-and-groove slope (coral ridges running down-slope,
//   separated by sand channels) → sand plain (≈13 m) dotted with bommies.
//
// The generator bakes height and a "reef substrate" factor (0 = sand,
// 1 = hard reef) into grids, so scattering, fish steering and camera
// collision can all query the same data cheaply.

import * as THREE from 'three';
import { SimplexNoise, Rng, smoothstep, lerp } from '../../util/noise.js';
import { makeSandTextures } from './seabed.js';
import { underwater } from '../../water/underwater.js';
import { SIMPLEX3, CELLULAR3, PERTURB_NORMAL } from '../../util/glsl.js';

export const REEF_DEFAULTS = {
  seed: 7,
  minX: -80, maxX: 80, minZ: -75, maxZ: 75,
  res: 0.5,
  flatY: 5.6, // reef flat top (surface at y = 8)
  plainY: -5.5, // sand plain
  crestX: -22, // where the reef flat drops away
  slopeWidth: 36,
  spurSpacing: 9,
  bommies: 9,
};

export function createReefField(opts = {}) {
  const o = { ...REEF_DEFAULTS, ...opts };
  const n = new SimplexNoise(o.seed);
  const rng = new Rng(o.seed * 31 + 1);

  // Bommies: isolated coral heads on the sand plain.
  const bommies = [];
  for (let i = 0; i < o.bommies; i++) {
    const x = rng.float(o.crestX + o.slopeWidth + 2, 40);
    const z = rng.float(-40, 40);
    if (bommies.some((b) => Math.hypot(b.x - x, b.z - z) < 11)) continue;
    bommies.push({ x, z, r: rng.float(2.2, 4.2), h: rng.float(1.8, 4.0) });
  }

  function raw(x, z) {
    const crest = o.crestX + 4 * n.noise3(z * 0.03, 0.5, 1.7);
    const t = smoothstep(crest - 1, crest + o.slopeWidth, x); // 0 flat → 1 plain
    const ease = t * t * (3 - 2 * t);
    const flat = o.flatY + 0.35 * n.fbm3(x * 0.05, 3.1, z * 0.05, 3);
    const plain = o.plainY + 0.6 * n.fbm3(x * 0.03, 8.4, z * 0.03, 3);
    let h = lerp(flat, plain, ease);

    // Spur and groove: ridges running down-slope, strongest mid-slope and
    // extending a little onto the crest.
    const sg = smoothstep(-0.05, 0.12, t) * smoothstep(1.0, 0.72, t);
    const zz = z + 3.5 * n.noise3(x * 0.05, 2.2, z * 0.02) + 1.5 * n.noise3(x * 0.15, 5.0, z * 0.1);
    const ph = zz / o.spurSpacing;
    const spur = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * ph), 1.4);
    const spurHeight = 2.4 * (0.7 + 0.3 * n.noise3(x * 0.08, 9.0, z * 0.08));
    h += sg * (spur * spurHeight - 0.9);

    // Bommies
    let bom = 0;
    for (const b of bommies) {
      const d = Math.hypot(x - b.x, z - b.z) / b.r;
      if (d < 1.6) {
        const k = Math.exp(-d * d * 1.6) * (1 + 0.25 * n.noise3(x * 0.4, z * 0.4, b.x));
        h += b.h * k;
        bom = Math.max(bom, smoothstep(1.25, 0.5, d));
      }
    }

    // Substrate: hard reef on the flat (with sand pools), on spurs and bommies.
    const pools = smoothstep(0.35, 0.55, n.fbm3(x * 0.07, 11.0, z * 0.07, 3));
    const flatReef = (1 - smoothstep(0.02, 0.2, t)) * (1 - pools);
    const spurReef = sg * smoothstep(0.3, 0.6, spur);
    const crestReef = smoothstep(-0.02, 0.05, t) * smoothstep(0.35, 0.2, t);
    let reef = Math.max(flatReef, spurReef, crestReef * 0.9, bom);
    reef = Math.min(1, reef);

    // Rugosity: reef is lumpy, sand is smooth.
    h += reef * (0.45 * n.fbm3(x * 0.3, 1.0, z * 0.3, 3) + 0.18 * n.noise3(x * 1.1, 4.0, z * 1.1) + 0.15);
    return { h, reef, t };
  }

  // Bake grids
  const nx = Math.round((o.maxX - o.minX) / o.res) + 1;
  const nz = Math.round((o.maxZ - o.minZ) / o.res) + 1;
  const H = new Float32Array(nx * nz);
  const R = new Float32Array(nx * nz);
  const T = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = o.minZ + j * o.res;
    for (let i = 0; i < nx; i++) {
      const x = o.minX + i * o.res;
      const r = raw(x, z);
      H[j * nx + i] = r.h;
      R[j * nx + i] = r.reef;
      T[j * nx + i] = r.t;
    }
  }
  const sample = (G, x, z) => {
    const fx = THREE.MathUtils.clamp((x - o.minX) / o.res, 0, nx - 1.001);
    const fz = THREE.MathUtils.clamp((z - o.minZ) / o.res, 0, nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = G[j * nx + i], b = G[j * nx + i + 1], c = G[(j + 1) * nx + i], d = G[(j + 1) * nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  const height = (x, z) => sample(H, x, z);
  const reef = (x, z) => sample(R, x, z);
  const zone = (x, z) => sample(T, x, z);
  const normal = (x, z, out = new THREE.Vector3()) => {
    const e = o.res;
    return out.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
  };
  return { o, nx, nz, H, R, height, reef, zone, normal, bommies };
}

export function createReefTerrainMesh(field) {
  const { o, nx, nz, H, R } = field;
  const geo = new THREE.PlaneGeometry(o.maxX - o.minX, o.maxZ - o.minZ, nx - 1, nz - 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((o.minX + o.maxX) / 2, 0, (o.minZ + o.maxZ) / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const reefAttr = new Float32Array(p.count);
  const tile = 3.2;
  // PlaneGeometry rotated -90° about X: rows run from -z (j=0) to +z.
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k);
    const i = Math.round((x - o.minX) / o.res);
    const j = Math.round((z - o.minZ) / o.res);
    p.setY(k, H[j * nx + i]);
    reefAttr[k] = R[j * nx + i];
    uv.setXY(k, x / tile, z / tile);
  }
  geo.setAttribute('aReef', new THREE.BufferAttribute(reefAttr, 1));
  geo.computeVertexNormals();

  const { map, normalMap } = makeSandTextures();
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95 });
  underwater(mat);
  mat.onBeforeCompile = ((prev) => (shader, renderer) => {
    prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aReef;\nvarying float vReef;\nvarying vec3 vTerrWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReef = aReef;\nvTerrWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vReef;
        varying vec3 vTerrWorld;
        ${SIMPLEX3}
        ${CELLULAR3}
        ${PERTURB_NORMAL}
        float reefMask;
        float reefH;
        // Hard-reef pavement: coral rubble and limestone under algal turf,
        // with blotches of encrusting coral / coralline algae.
        float reefHeight(vec3 p) {
          vec2 c = cellular(p * 3.0);
          float h = fbm3(p * 1.2) * 0.08;
          h += smoothstep(0.8, 0.15, c.x) * 0.045; // rubble lumps
          vec2 c2 = cellular(p * 16.0);
          h += (c2.y - c2.x) * 0.006;
          return h;
        }
        vec3 reefColor(vec3 p) {
          vec3 stone = vec3(0.5, 0.45, 0.36);
          vec3 turf = vec3(0.3, 0.3, 0.17);
          vec3 c = mix(stone, turf, smoothstep(-0.35, 0.2, fbm3(p * 0.7)));
          vec2 cell = cellular(p * 3.0);
          c *= 0.72 + 0.4 * smoothstep(0.0, 0.55, cell.x); // shaded crevices between rubble
          // Encrusting colonies: organic blotches, colour chosen by a slow field.
          float blob = fbm3(p * 1.6 + 7.0) + 0.25 * snoise(p * 6.0);
          float hue = snoise(p * 0.35 + 3.0) * 0.5 + 0.5;
          vec3 enc = hue < 0.33 ? mix(vec3(0.62, 0.36, 0.52), vec3(0.72, 0.46, 0.5), hue * 3.0)
                   : hue < 0.66 ? mix(vec3(0.46, 0.56, 0.32), vec3(0.62, 0.58, 0.32), (hue - 0.33) * 3.0)
                   : mix(vec3(0.42, 0.52, 0.6), vec3(0.6, 0.4, 0.6), (hue - 0.66) * 3.0);
          c = mix(c, enc, smoothstep(0.08, 0.22, blob) * 0.8);
          c *= 0.88 + 0.2 * snoise(p * 11.0);
          return c;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        reefMask = smoothstep(0.3, 0.7, vReef + 0.22 * snoise(vTerrWorld * 0.9) + 0.08 * snoise(vTerrWorld * 4.0));
        reefH = reefHeight(vTerrWorld) * reefMask;
        diffuseColor.rgb = mix(diffuseColor.rgb, reefColor(vTerrWorld), reefMask);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = perturbNormalH(-vViewPosition, normal, reefH, faceDirection);`,
      );
  })(mat.onBeforeCompile);
  mat.customProgramCacheKey = () => 'reefTerrain';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'reefTerrain';
  return mesh;
}
