// Brain coral (Platygyra / Leptoria style): a lumpy dome whose meandering
// valleys are drawn per-pixel as the zero-isolines of warped noise.

import * as THREE from 'three';
import { SimplexNoise } from '../../util/noise.js';
import { proceduralSurface } from '../materials.js';
import { underwater } from '../../water/underwater.js';
import { labyrinthTexture } from '../../util/reactionDiffusion.js';

const PALETTES = {
  green: { ridge: 0xa89a5a, valley: 0x6f9a52, tip: 0xe0e0a8 },
  honey: { ridge: 0xc89050, valley: 0xa0b068, tip: 0xf5e2b0 },
  lime: { ridge: 0x7a9a4a, valley: 0xc6df7a, tip: 0xe9f7aa },
  moss: { ridge: 0x8a8a4a, valley: 0xb0c070, tip: 0xe0e8a8 },
};

export function createBrainCoral({ radius = 0.45, height = 0.75, seed = 3, palette = 'honey', grooveScale = 1, segments = 1 } = {}) {
  const noise = new SimplexNoise(seed);
  const geo = new THREE.SphereGeometry(1, Math.round(160 * segments), Math.round(96 * segments));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const lump = 1 + 0.12 * noise.fbm3(v.x * 1.3, v.y * 1.3, v.z * 1.3, 3) + 0.04 * noise.noise3(v.x * 4, v.y * 4, v.z * 4);
    v.multiplyScalar(lump);
    // Dome: squash, and pinch the lower hemisphere into a short skirt.
    if (v.y < 0) v.y *= 0.18;
    v.y = v.y * height + 0.04;
    v.x *= radius;
    v.z *= radius;
    // Slight base flare
    const s = 1 + 0.08 * Math.max(0, 0.12 - v.y) / 0.12;
    v.x *= s;
    v.z *= s;
    p.setXYZ(i, v.x, v.y * radius, v.z);
  }
  geo.computeVertexNormals();

  const pal = PALETTES[palette] ?? PALETTES.green;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
  underwater(mat);
  proceduralSurface(mat, {
    key: 'brain',
    uniforms: {
      uRidge: { value: new THREE.Color(pal.ridge) },
      uValley: { value: new THREE.Color(pal.valley) },
      uTip: { value: new THREE.Color(pal.tip) },
      uMaze: { value: labyrinthTexture() },
      uMazeScale: { value: 4.0 / grooveScale },
      uSeed: { value: seed * 1.37 },
    },
    glsl: /* glsl */ `
      // Triplanar lookup of the reaction-diffusion labyrinth.
      float brainField(vec3 p) {
        vec3 n = normalize(vObjNrm);
        vec3 w = pow(abs(n), vec3(4.0));
        w /= (w.x + w.y + w.z);
        vec3 q = p * uMazeScale + uSeed;
        // Gentle warp so the tiling never shows.
        q += 0.08 * vec3(snoise(p * 3.0), snoise(p * 3.0 + 5.2), snoise(p * 3.0 - 7.7));
        float a = texture2D(uMaze, q.yz).r;
        float b = texture2D(uMaze, q.zx).r;
        float c = texture2D(uMaze, q.xy).r;
        return a * w.x + b * w.y + c * w.z; // 1 on ridges, 0 in valleys
      }
      float surfH(vec3 p) {
        float r = smoothstep(0.15, 0.75, brainField(p));
        return sqrt(r) * 0.009;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        float n = brainField(p);
        float ridge = smoothstep(0.2, 0.6, n);
        vec3 c = mix(uValley, uRidge, ridge);
        // Pale crest line on top of each ridge.
        c = mix(c, uTip, smoothstep(0.75, 0.95, n) * 0.5);
        // Dark groove line at the very bottom of valleys.
        c *= mix(0.55, 1.0, smoothstep(0.02, 0.18, n));
        // Darker toward the base where less light reaches.
        c *= mix(0.55, 1.0, smoothstep(0.0, 0.2, p.y));
        c *= 0.9 + 0.2 * snoise(p * 5.0);
        return c * base;
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'brainCoral';
  return mesh;
}
