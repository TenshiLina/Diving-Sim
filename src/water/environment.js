// Visible-water effects that live in the scene: the water volume "sky dome",
// the surface seen from below (Snell's window + total internal reflection),
// volumetric-looking god rays and drifting marine snow.

import * as THREE from 'three';
import { water, WATER_PARS } from './underwater.js';
import { SIMPLEX3 } from '../util/glsl.js';

// ---------------------------------------------------------------------------
// Background: the colour of open water in every direction.
// ---------------------------------------------------------------------------
export function createWaterDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...water },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        // Drawn first with depth testing off, so it needs no far-plane tricks
        // (pinning it exactly to the far plane is fragile on some GPUs).
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${WATER_PARS}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = waterColor(d);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (_r, _s, camera) => {
    mesh.position.copy(camera.position);
    // Stay well inside the far plane whatever the scene sets it to.
    mesh.scale.setScalar(camera.far * 0.5);
    mesh.updateMatrixWorld();
  };
  mesh.name = 'waterDome';
  return mesh;
}

// ---------------------------------------------------------------------------
// Water surface seen from below.
// ---------------------------------------------------------------------------
export function createSurface({ size = 400 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...water, uSky: { value: new THREE.Color(0xeafcff) } },
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${WATER_PARS}
      ${SIMPLEX3}
      uniform vec3 uSky;
      varying vec3 vWorld;
      vec2 waveGrad(vec2 p, float t) {
        // Sum of a few directional swells + noise chop; returns d(height)/d(xz).
        vec2 g = vec2(0.0);
        vec2 dirs[4];
        dirs[0] = normalize(vec2(1.0, 0.3));
        dirs[1] = normalize(vec2(-0.4, 1.0));
        dirs[2] = normalize(vec2(0.7, -0.8));
        dirs[3] = normalize(vec2(-1.0, -0.2));
        float amps[4];
        amps[0] = 0.10; amps[1] = 0.07; amps[2] = 0.05; amps[3] = 0.035;
        float fr[4];
        fr[0] = 0.55; fr[1] = 0.9; fr[2] = 1.6; fr[3] = 2.7;
        for (int i = 0; i < 4; i++) {
          float ph = dot(dirs[i], p) * fr[i] + t * sqrt(9.8 * fr[i]) * 0.6;
          g += dirs[i] * amps[i] * fr[i] * cos(ph);
        }
        float e = 0.05;
        vec3 q = vec3(p * 1.4, t * 0.35);
        g += 0.18 * vec2(snoise(q + vec3(e, 0, 0)) - snoise(q - vec3(e, 0, 0)), snoise(q + vec3(0, e, 0)) - snoise(q - vec3(0, e, 0))) / (2.0 * e) * 0.12;
        return g;
      }
      void main() {
        vec2 g = waveGrad(vWorld.xz, uTime);
        // Normal pointing down into the water.
        vec3 n = normalize(vec3(g.x, -1.0, g.y));
        vec3 v = normalize(vWorld - cameraPosition);
        vec3 col;
        // Water -> air: eta = 1.333
        vec3 rf = refract(v, n, 1.333);
        float cosI = dot(-v, n);
        if (dot(rf, rf) < 1e-4) {
          // Total internal reflection: mirror of the water below.
          vec3 r = reflect(v, n);
          col = waterColor(r) * 0.85;
        } else {
          // Snell's window: bright sky, with a hot spot toward the sun.
          float sun = pow(max(dot(normalize(rf), normalize(uSunDir)), 0.0), 350.0) * 25.0;
          float halo = pow(max(dot(normalize(rf), normalize(uSunDir)), 0.0), 12.0) * 1.5;
          // Fresnel at the interface (more reflective near the window edge).
          float F = 0.02 + 0.98 * pow(1.0 - clamp(cosI, 0.0, 1.0), 5.0);
          vec3 sky = uSky * (1.1 + halo) + vec3(1.0, 0.98, 0.9) * sun;
          col = mix(sky, waterColor(reflect(v, n)), clamp(F * 1.6, 0.0, 1.0));
        }
        col = applyWater(col, vWorld, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(Math.PI / 2); // face down
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = water.uSurfaceY.value;
  mesh.name = 'surface';
  mesh.onBeforeRender = (_r, _s, camera) => {
    mesh.position.x = camera.position.x;
    mesh.position.z = camera.position.z;
    mesh.position.y = water.uSurfaceY.value;
  };
  return mesh;
}

// ---------------------------------------------------------------------------
// God rays: long camera-facing ribbons aligned with the refracted sunlight.
// ---------------------------------------------------------------------------
export function createGodRays({ count = 34, radius = 18, seed = 3 } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const base = new THREE.PlaneGeometry(1, 1, 1, 12);
  base.translate(0, -0.5, 0); // top edge at y=0
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const offs = new Float32Array(count * 4);
  const extra = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    offs[i * 4] = Math.cos(a) * r;
    offs[i * 4 + 1] = 0;
    offs[i * 4 + 2] = Math.sin(a) * r;
    offs[i * 4 + 3] = 0.4 + rnd() * 1.8; // width
    extra[i * 3] = rnd() * 100; // phase
    extra[i * 3 + 1] = 0.5 + rnd() * 0.8; // intensity
    extra[i * 3 + 2] = 7 + rnd() * 6; // length
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 4));
  geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 3));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    uniforms: { ...water, uRayStrength: { value: 0.22 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uSurfaceY;
      uniform vec3 uSunDir;
      uniform float uTime;
      attribute vec4 aOffset;
      attribute vec3 aExtra;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vIntensity;
      varying float vPhase;
      void main() {
        vUv = uv;
        // Refracted sun direction in water (points downward).
        vec3 L = normalize(-uSunDir);
        L = normalize(vec3(L.x * 0.75, L.y, L.z * 0.75));
        vec3 top = vec3(aOffset.x, uSurfaceY - 0.05, aOffset.z);
        // Slow drift of the ray pattern with the surface swell.
        top.xz += vec2(sin(uTime * 0.07 + aExtra.x), cos(uTime * 0.05 + aExtra.x * 1.3)) * 1.5;
        top.xz += cameraPosition.xz;
        top.xz -= mod(cameraPosition.xz, 1.0) * 0.0;
        float along = -position.y * aExtra.z;
        vec3 axisPt = top + L * along;
        // Cylindrical billboard: widen perpendicular to both the ray and view.
        vec3 toCam = normalize(cameraPosition - axisPt);
        vec3 side = cross(L, toCam);
        float sideLen = length(side);
        side = sideLen > 1e-5 ? side / sideLen : vec3(1.0, 0.0, 0.0);
        float w = aOffset.w * (1.0 + 0.6 * -position.y); // rays spread as they fall
        vec3 wp = axisPt + side * position.x * w;
        vWorld = wp;
        vIntensity = aExtra.y;
        vPhase = aExtra.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${WATER_PARS}
      uniform float uRayStrength;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vIntensity;
      varying float vPhase;
      void main() {
        float edge = sin(vUv.x * 3.14159);
        // sin(pi) is a tiny negative number in float; pow() of a negative base
        // is undefined and returns NaN on Apple GPUs, so clamp first.
        edge = pow(max(edge, 0.0), 2.5);
        float along = 1.0 - vUv.y; // 0 at top, 1 at bottom
        float fall = smoothstep(0.0, 0.08, along) * pow(max(1.0 - along, 0.0), 1.6);
        // Flicker as surface waves focus / defocus the light.
        float flick = 0.55 + 0.45 * sin(uTime * 0.9 + vPhase) * sin(uTime * 0.53 + vPhase * 1.7);
        // Fade out when the camera is inside / close to a shaft.
        float dCam = length(vWorld - cameraPosition);
        float near = smoothstep(0.6, 4.0, dCam);
        vec3 trans = exp(-uAbsorb * dCam);
        vec3 c = mix(uWaterUp, vec3(1.0), 0.5) * trans;
        float a = edge * fall * flick * near * vIntensity * uRayStrength;
        gl_FragColor = vec4(c * a, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'godRays';
  return mesh;
}

// ---------------------------------------------------------------------------
// Marine snow: tiny drifting particles in a box that wraps around the camera.
// ---------------------------------------------------------------------------
export function createMarineSnow({ count = 3500, box = 16 } = {}) {
  let s = 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = new Float32Array(count * 3);
  const extra = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rnd() * box;
    pos[i * 3 + 1] = rnd() * box;
    pos[i * 3 + 2] = rnd() * box;
    extra[i * 2] = rnd(); // size
    extra[i * 2 + 1] = rnd() * 100; // phase
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aExtra', new THREE.BufferAttribute(extra, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...water, uBox: { value: box }, uPixelRatio: { value: 1 }, uViewportH: { value: 800 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uBox, uPixelRatio, uViewportH;
      attribute vec2 aExtra;
      varying float vAlpha;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        // Drift: slow sink + meander.
        p += vec3(sin(uTime * 0.2 + aExtra.y) * 0.3 + uTime * 0.05, -uTime * 0.03, cos(uTime * 0.17 + aExtra.y * 1.3) * 0.3);
        // Wrap into a box centred on the camera.
        vec3 origin = cameraPosition - uBox * 0.5;
        p = origin + mod(p - origin, uBox);
        vWorld = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.006, 0.02, aExtra.x * aExtra.x);
        gl_PointSize = size * uViewportH * projectionMatrix[1][1] / -mv.z * 0.5 * uPixelRatio;
        gl_PointSize = max(gl_PointSize, 1.0);
        float d = length(mv.xyz);
        // Fade at box edges so wrapping is invisible, and very near the lens.
        vAlpha = smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.15, 0.5, d);
      }`,
    fragmentShader: /* glsl */ `
      ${WATER_PARS}
      varying float vAlpha;
      varying vec3 vWorld;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        float a = smoothstep(0.5, 0.1, r) * vAlpha * 0.55;
        vec3 col = vec3(0.85, 0.95, 0.95) * depthTint(vWorld) * 1.2;
        col = applyWater(col, vWorld, cameraPosition);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 20;
  pts.name = 'marineSnow';
  return pts;
}
