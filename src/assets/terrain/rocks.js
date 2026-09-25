// Reef rock ("bommie" base): lumpy limestone boulders encrusted with coralline
// algae and turf, detailed per-pixel.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../../util/noise.js';
import { proceduralSurface } from '../materials.js';
import { underwater } from '../../water/underwater.js';

let rockMat = null;
export function getRockMaterial() {
  if (rockMat) return rockMat;
  rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  underwater(rockMat);
  proceduralSurface(rockMat, {
    key: 'rock',
    uniforms: {
      uCoralline: { value: new THREE.Color('#c87a98') },
      uTurf: { value: new THREE.Color('#8f8a52') },
      uStone: { value: new THREE.Color('#c8baa2') },
    },
    glsl: /* glsl */ `
      float surfH(vec3 p) {
        float h = fbm3(p * 6.0) * 0.02;
        vec2 c = cellular(p * 18.0);
        h += (c.y - c.x) * 0.004; // pitted limestone
        h -= smoothstep(0.25, 0.0, c.x) * 0.006;
        return h;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        float n = fbm3(p * 1.6 + 3.0);
        float m = fbm3(p * 4.0 - 1.0);
        vec3 c = uStone;
        c = mix(c, uTurf, smoothstep(-0.1, 0.25, n));
        float m2 = fbm3(p * 9.0 + 4.0);
        c = mix(c, uCoralline, smoothstep(0.15, 0.45, m) * smoothstep(-0.2, 0.3, m2) * 0.6);
        // Speckled encrusting life.
        c = mix(c, vec3(0.75, 0.62, 0.4), smoothstep(0.55, 0.7, snoise(p * 40.0)) * 0.5);
        vec2 cc = cellular(p * 18.0);
        c *= 0.75 + 0.35 * smoothstep(0.0, 0.4, cc.x);
        c *= 0.85 + 0.3 * snoise(p * 25.0) * 0.5;
        return c * base;
      }
    `,
  });
  return rockMat;
}

export function createRock({ radius = 0.6, seed = 1, flatten = 0.55, detail = 5 } = {}) {
  const noise = new SimplexNoise(seed);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const geo = mergeVertices(ico);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise.fbm3(v.x * 1.2, v.y * 1.2, v.z * 1.2, 5);
    const r = 1 + 0.35 * n + 0.08 * noise.noise3(v.x * 5, v.y * 5, v.z * 5);
    v.multiplyScalar(r * radius);
    v.y *= flatten;
    if (v.y < -radius * 0.15) v.y = -radius * 0.15 + (v.y + radius * 0.15) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
    // Crevices (low r) darker: cheap cavity occlusion.
    const ao = THREE.MathUtils.clamp(0.8 + (r - 1) * 1.2, 0.55, 1.1);
    col.push(ao, ao, ao);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, getRockMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'rock';
  return mesh;
}
