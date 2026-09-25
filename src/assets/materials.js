// Material helpers shared by the procedural assets.

import * as THREE from 'three';
import { SIMPLEX3, CELLULAR3, PERTURB_NORMAL } from '../util/glsl.js';
import { water } from '../water/underwater.js';

/**
 * Procedural surface detail evaluated per-pixel in object space.
 *
 * `glsl` must define:
 *   float surfH(vec3 p)                       // height offset in metres
 *   vec3  surfCol(vec3 base, vec3 p, float h) // albedo given vertex/base colour
 * and may use snoise / fbm3 / cellular and uniforms passed in `uniforms`.
 */
export function proceduralSurface(material, { glsl, uniforms = {}, key = '' }) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjNrm = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        ${Object.keys(uniforms)
          .map((k) => `uniform ${glslType(uniforms[k].value)} ${k};`)
          .join('\n')}
        ${SIMPLEX3}
        ${CELLULAR3}
        ${PERTURB_NORMAL}
        ${glsl}
        float psH;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        psH = surfH(vObjPos);
        diffuseColor.rgb = surfCol(diffuseColor.rgb, vObjPos, psH);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = perturbNormalH(-vViewPosition, normal, psH, faceDirection);`,
      );
  };
  material.customProgramCacheKey = () => 'ps:' + key + glsl.length;
  return material;
}

function glslType(v) {
  if (typeof v === 'number') return 'float';
  if (v && v.isVector2) return 'vec2';
  if (v && v.isVector3) return 'vec3';
  if (v && v.isColor) return 'vec3';
  if (v && v.isVector4) return 'vec4';
  if (v && v.isTexture) return 'sampler2D';
  throw new Error('unsupported uniform type');
}

/**
 * Current-driven sway for soft organisms. Geometry must provide
 * `aSway` (0 at the anchored base -> 1 at the free tip) and may provide
 * `aPhase` for per-strand variation.
 */
export function addSway(material, { amp = 0.08, freq = 1.0, stiffness = 2.0, current = 0.35, swapXZ = false } = {}) {
  const prev = material.onBeforeCompile;
  const u = {
    uSwayAmp: { value: amp },
    uSwayFreq: { value: freq },
    uSwayStiff: { value: stiffness },
    uCurrent: { value: current },
  };
  material.userData.sway = u;
  if (swapXZ) {
    material.defines = material.defines || {};
    material.defines.SWAY_SWAP_XZ = '';
  }
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, u, { uSwayTime: water.uTime });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSway;
        attribute float aPhase;
        uniform float uSwayAmp, uSwayFreq, uSwayStiff, uCurrent;
        uniform float uSwayTime;
        vec3 swayOffset(vec3 p, float s, float ph) {
          float w = pow(s, uSwayStiff);
          float t = uSwayTime * uSwayFreq;
          // Slow surge (the whole reef breathes back and forth) + local flutter.
          float surge = sin(t * 0.9 + p.x * 0.35 + p.z * 0.2) * 0.8 + sin(t * 0.37 + 1.3) * 0.5;
          float flutter = sin(t * 2.3 + ph * 6.2831 + p.y * 3.0) * 0.35;
          float side = cos(t * 1.1 + ph * 6.2831 + p.x) * 0.5;
          vec3 o = uSwayAmp * w * vec3(surge + flutter + uCurrent, -0.15 * abs(surge), side + flutter * 0.5);
          #ifdef SWAY_SWAP_XZ
          o = o.zyx;
          #endif
          return o;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += swayOffset(position, aSway, aPhase);`,
      );
  };
  return material;
}

/** Standard vertex-coloured underwater material. */
export function reefMaterial(opts = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...opts });
}
