// Giant clam (Tridacna gigas / maxima / squamosa).
//
// One deformed ellipsoid: the lower part is the fluted shell whose big radial
// folds give the gape its zigzag outline; everything above the lip line is
// flattened into the mantle, which carries the famous iridescent colours and
// slowly "breathes". Shell vs mantle is a per-vertex attribute so both share a
// single draw call.

import * as THREE from 'three';
import { SimplexNoise } from '../../util/noise.js';
import { proceduralSurface } from '../materials.js';
import { underwater, water } from '../../water/underwater.js';

const PALETTES = {
  // mantle base, mantle pattern, mantle rim/spots
  electric: ['#1a3fb8', '#2fd0ff', '#0a0f40'],
  emerald: ['#1f6a3a', '#9fe060', '#e8d040'],
  violet: ['#4a1f7a', '#c070ff', '#20e0e0'],
  gold: ['#7a5a1a', '#e8c050', '#3a8a60'],
};

export function createGiantClam({ length = 0.7, seed = 3, palette = 'electric', folds = 5, gape = 0.18, segments = 1 } = {}) {
  const noise = new SimplexNoise(seed);
  const L = length / 2;
  const W = length * 0.3;
  const Hh = length * 0.38;
  const geo = new THREE.SphereGeometry(1, Math.round(96 * segments), Math.round(64 * segments));
  const p = geo.attributes.position;
  const mantle = new Float32Array(p.count);
  const v = new THREE.Vector3();
  const lipAt = (x) => {
    // Zigzag lip: folds interlock, so the gape zigzags along the length.
    const u = x / L; // -1..1
    return Hh * (0.62 + 0.09 * Math.cos(u * Math.PI * folds)) * Math.sqrt(Math.max(0, 1 - u * u * 0.85));
  };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const side = Math.sign(v.z) || 1;
    let x = v.x * L;
    let y = v.y * Hh + Hh * 0.35;
    let z = v.z * W;
    // Radial folds on the shell (ridges run from hinge to lip).
    const u = x / L;
    const fold = Math.cos(u * Math.PI * folds + (side > 0 ? 0 : Math.PI));
    const lip = lipAt(x) + side * fold * 0.0; // interlock handled via fold sign
    const shellness = 1 - THREE.MathUtils.smoothstep(y, lip - 0.02, lip + 0.02);
    z *= 1 + 0.24 * fold * shellness * Math.min(1, Math.max(0, y / Hh));
    // Flat-ish base where it sits on the reef.
    if (y < 0) y *= 0.25;
    // Mantle: squash everything above the lip into a low, lumpy dome that
    // spills slightly over the shell edge.
    if (y > lip) {
      const over = y - lip;
      y = lip + over * gape * (0.85 + 0.2 * noise.noise3(x * 8, 1.0, z * 8));
      z *= 1.04 + 0.05 * noise.noise3(x * 10, 2.0, z * 10);
      mantle[i] = 1;
    }
    // Squamosa-style scale rows / growth lumps.
    const bump = 0.004 * noise.noise3(x * 20, y * 20, z * 20);
    p.setXYZ(i, x + bump, y, z + bump * side);
  }
  geo.setAttribute('aMantle', new THREE.BufferAttribute(mantle, 1));
  geo.computeVertexNormals();

  const pal = PALETTES[palette].map((c) => new THREE.Color(c));
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  underwater(mat);
  proceduralSurface(mat, {
    key: 'clam',
    uniforms: {
      uM0: { value: pal[0] },
      uM1: { value: pal[1] },
      uM2: { value: pal[2] },
      uClamL: { value: L },
      uFolds: { value: folds },
    },
    glsl: /* glsl */ `
      varying float vMantle;
      float surfH(vec3 p) {
        if (vMantle > 0.5) return snoise(p * 60.0) * 0.0015;
        // Growth lines + scale-like ridges on the shell.
        float growth = sin(p.y * 260.0 + snoise(p * 20.0) * 3.0) * 0.0008;
        float scales = smoothstep(0.7, 0.95, snoise(vec3(p.x * 18.0, p.y * 40.0, p.z * 18.0))) * 0.0015;
        return growth + scales;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        // Shell: chalky white-grey with algal staining in the folds.
        float fold = cos(p.x / uClamL * 3.14159 * uFolds);
        vec3 shell = mix(vec3(0.86, 0.84, 0.78), vec3(0.62, 0.6, 0.5), smoothstep(0.3, -0.6, fold));
        shell *= 0.85 + 0.2 * snoise(p * 30.0);
        shell = mix(shell, vec3(0.45, 0.5, 0.35), smoothstep(0.35, 0.0, p.y / (uClamL * 0.6)) * 0.4);
        shell *= 0.8 + 0.3 * smoothstep(-0.8, 0.8, fold);
        // Mantle: marbled bands, a vivid pattern layer and rim spots.
        // Flowing bands parallel to the gape, broken by softer marbling.
        float band = sin(abs(p.z) * 180.0 + snoise(p * 12.0) * 2.5);
        float m1 = snoise(p * 16.0 + vec3(0.0, 0.0, 3.0));
        vec3 mant = mix(uM0, uM1, smoothstep(-0.4, 0.7, m1 * 0.75 + band * 0.25));
        vec2 sp = cellular(p * 90.0);
        mant = mix(mant, uM2, smoothstep(0.2, 0.1, sp.x) * 0.6 * smoothstep(0.2, 0.6, snoise(p * 9.0 + 5.0)));
        // Paler rim where the mantle meets the shell.
        mant = mix(mant, uM1 * 0.9 + 0.1, smoothstep(0.02, 0.0, abs(p.y - uClamL * 0.45)) * 0.0);
        // Dark siphon slit along the middle of the gape.
        mant *= mix(0.25, 1.0, smoothstep(0.004, 0.02, abs(p.z)));
        return mix(shell, mant, vMantle);
      }
    `,
  });
  // Mantle breathing + a touch of fluorescence (these clams glow under blue light).
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uClamTime = water.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMantle;\nvarying float vMantle;\nuniform float uClamTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMantle = aMantle;
        {
          float ph = uClamTime * 0.6;
          #ifdef USE_INSTANCING
          ph += instanceMatrix[3].x * 1.7 + instanceMatrix[3].z;
          #endif
          transformed.z *= 1.0 + aMantle * 0.035 * sin(ph);
          transformed.y += aMantle * 0.006 * sin(ph + 1.0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vMantle * 0.15;',
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'giantClam';
  return mesh;
}
