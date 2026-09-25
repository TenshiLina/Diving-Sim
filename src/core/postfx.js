// Post-processing: bloom for the sun-lit surface and caustic glints, then an
// "underwater lens" pass (refraction wobble, chromatic fringing, blue-green
// vignette, fine grain).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDistort: { value: 0.0014 },
    uCA: { value: 0.003 },
    uVignette: { value: 0.9 },
    uTint: { value: new THREE.Color(0x0b3f55) },
    uGrain: { value: 0.025 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uDistort, uCA, uVignette, uGrain;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      uv += vec2(sin(uv.y * 21.0 + uTime * 1.3) + sin(uv.y * 7.0 - uTime * 0.7),
                 cos(uv.x * 17.0 + uTime * 1.1) + cos(uv.x * 5.0 + uTime * 0.6)) * uDistort;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec2 dir = c * uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;
      float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 1.15)));
      col = mix(col * uTint * 2.0, col, mix(1.0, vig, uVignette));
      col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain * (col + 0.05);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createComposer(renderer, scene, camera, { msaa = 4 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // Half-float keeps HDR highlights for bloom; fall back to 8-bit targets on
  // GPUs that cannot render to half-float buffers.
  const gl = renderer.getContext();
  const halfOk = Boolean(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: msaa,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.6, 0.85);
  composer.addPass(bloom);
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  return { composer, bloom, lens };
}
