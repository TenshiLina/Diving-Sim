// The "water is not invisible" layer.
//
// Every material in the scene is passed through `underwater(material)`, which
// patches three.js' built-in shaders so that:
//   * light is attenuated per-wavelength with distance from the camera
//     (reds vanish first, so far objects drift toward turquoise),
//   * objects further below the surface receive bluer, dimmer light,
//   * the sun's direct light is modulated by animated, chromatic caustics
//     projected down from the surface (respecting shadows),
//   * everything fades into a view-dependent water colour that matches the
//     background dome, so there is no visible "fog wall".
//
// All tunables live in the shared `water` uniforms object so the whole scene
// can be re-graded from one place (e.g. per dive site in the full build).

import * as THREE from 'three';

export const water = {
  uTime: { value: 0 },
  uSurfaceY: { value: 8.0 },
  // Per-channel extinction per metre (linear space). Small = clear water.
  uAbsorb: { value: new THREE.Vector3(0.105, 0.032, 0.026) },
  // How strongly depth-below-surface tints the incoming light.
  uDepthTint: { value: 0.4 },
  // In-scattered water colour looking horizontally / straight up / straight down.
  uWaterHorizon: { value: new THREE.Color(0x1d8fa6) },
  uWaterUp: { value: new THREE.Color(0x7fdcea) },
  uWaterDown: { value: new THREE.Color(0x053a52) },
  uSunDir: { value: new THREE.Vector3(0.25, 1.0, 0.18).normalize() }, // points toward the sun
  uCausticScale: { value: 0.19 },
  uCausticStrength: { value: 1.6 },
};

// ---------------------------------------------------------------------------
// GLSL shared by patched materials and custom shaders.
// ---------------------------------------------------------------------------

export const WATER_PARS = /* glsl */ `
uniform float uTime;
uniform float uSurfaceY;
uniform vec3 uAbsorb;
uniform float uDepthTint;
uniform vec3 uWaterHorizon;
uniform vec3 uWaterUp;
uniform vec3 uWaterDown;
uniform vec3 uSunDir;
uniform float uCausticScale;
uniform float uCausticStrength;

// Colour of the water volume seen along a (world-space) view direction.
vec3 waterColor(vec3 dir) {
  float y = dir.y;
  vec3 c = mix(uWaterHorizon, uWaterUp, smoothstep(0.0, 0.9, y));
  c = mix(c, uWaterDown, smoothstep(0.0, -0.75, y));
  // A soft glow toward the sun.
  float s = max(dot(dir, uSunDir), 0.0);
  c += uWaterUp * 0.35 * pow(s, 8.0);
  return c;
}

// Tileable caustic pattern (after "Tileable Water Caustic" by joltz0r / Dave_Hoskins).
float causticLayer(vec2 uv, float t) {
  const float TAU = 6.28318530718;
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    float sx = sin(i.x + tt), cy = cos(i.y + tt);
    sx = abs(sx) < 1e-6 ? 1e-6 : sx;
    cy = abs(cy) < 1e-6 ? 1e-6 : cy;
    c += 1.0 / max(length(vec2(p.x / (sx / inten), p.y / (cy / inten))), 1e-6);
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 7.0);
}

// RGB caustics projected along the sun direction from the surface.
vec3 caustics(vec3 wp) {
  float depth = max(uSurfaceY - wp.y, 0.0);
  vec2 proj = wp.xz - uSunDir.xz / max(uSunDir.y, 0.2) * depth;
  vec2 uv = proj * uCausticScale;
  float t = uTime * 0.45;
  // Slight chromatic split grows with depth, like real dispersion.
  float split = 0.0015 + depth * 0.0004;
  vec3 c = vec3(
    causticLayer(uv + vec2(split, 0.0), t),
    causticLayer(uv, t),
    causticLayer(uv - vec2(split, 0.0), t)
  );
  // Caustics soften with depth.
  float sharp = exp(-depth * 0.06);
  return c * sharp;
}

// Colour of light that has travelled from the surface down to world point wp.
vec3 depthTint(vec3 wp) {
  float depth = max(uSurfaceY - wp.y, 0.0);
  return exp(-uAbsorb * depth * uDepthTint);
}

// Blend a lit surface colour with the water between it and the camera.
vec3 applyWater(vec3 col, vec3 wp, vec3 camPos) {
  vec3 v = wp - camPos;
  float d = length(v);
  vec3 dir = v / max(d, 1e-4);
  // Clear near the diver, closing in quickly past ~25 m so the world edge
  // dissolves into open water.
  vec3 trans = exp(-uAbsorb * d - max(d - 22.0, 0.0) * 0.09);
  return col * trans + waterColor(dir) * (1.0 - trans);
}
`;

let patched = false;

// Replace three's fog chunks with our water model. Materials opt in by having
// `fog: true` (the default for built-ins) and going through `underwater()`.
function patchChunks() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;

  C.fog_pars_vertex = /* glsl */ `
#ifdef UNDERWATER
varying vec3 vUWWorld;
#endif
`;
  C.fog_vertex = /* glsl */ `
#ifdef UNDERWATER
  {
    vec4 uwWorld = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      uwWorld = batchingMatrix * uwWorld;
    #endif
    #ifdef USE_INSTANCING
      uwWorld = instanceMatrix * uwWorld;
    #endif
    uwWorld = modelMatrix * uwWorld;
    vUWWorld = uwWorld.xyz;
  }
#endif
`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef UNDERWATER
varying vec3 vUWWorld;
${WATER_PARS}
#endif
`;
  C.fog_fragment = /* glsl */ `
#ifdef UNDERWATER
  gl_FragColor.rgb *= depthTint( vUWWorld );
  gl_FragColor.rgb = applyWater( gl_FragColor.rgb, vUWWorld, cameraPosition );
#endif
`;

  // Modulate direct sunlight with caustics (after shadowing, so caustics
  // never appear in shade).
  const marker = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const src = C.lights_fragment_begin;
  const dirStart = src.indexOf('#if ( NUM_DIR_LIGHTS > 0 )');
  const idx = src.indexOf(marker, dirStart);
  if (dirStart < 0 || idx < 0) {
    console.warn('[underwater] could not find directional light block; caustics disabled');
    return;
  }
  C.lights_fragment_begin =
    src.slice(0, idx) +
    `
    #if defined( UNDERWATER ) && defined( UW_CAUSTICS )
      directLight.color *= 0.35 + uCausticStrength * caustics( vUWWorld );
    #endif
    ` +
    src.slice(idx);
}

/**
 * Opt a material into the underwater model.
 * @param {THREE.Material} material
 * @param {{caustics?: boolean}} opts
 */
export function underwater(material, { caustics = true } = {}) {
  patchChunks();
  material.fog = true;
  material.defines = material.defines || {};
  material.defines.UNDERWATER = '';
  if (caustics) material.defines.UW_CAUSTICS = '';
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, water);
    if (prev) prev.call(material, shader, renderer);
  };
  return material;
}

/** Uniforms to spread into a custom ShaderMaterial that includes WATER_PARS. */
export function waterUniforms() {
  return { ...water };
}
