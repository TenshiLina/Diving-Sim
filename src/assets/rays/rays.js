// Rays: a parametric disc + tail with a painted top-view texture and a GPU
// fin-wave, shared by two species with very different swimming styles:
//   * blue-spotted ribbontail ray (Taeniura lymma) — ripples the edge of a
//     round disc in waves running nose to tail, rests on the sand;
//   * spotted eagle ray (Aetobatus ocellatus) — "flies" with big synchronous
//     wing beats in open water.
//
// Local frame matches the fish: nose toward +x, up +y, disc spans z.

import * as THREE from 'three';
import { monotone } from '../../util/curves.js';
import { underwater } from '../../water/underwater.js';

export const RAY_SPECIES = {
  ribbontail: {
    name: 'Blue-spotted ribbontail ray',
    latin: 'Taeniura lymma',
    length: 0.45, // disc length (m)
    halfWidth: [[0.5, 0.0], [0.47, 0.16], [0.35, 0.34], [0.15, 0.43], [-0.05, 0.43], [-0.25, 0.36], [-0.42, 0.2], [-0.5, 0.0]],
    thickness: 0.07,
    tail: { length: 0.95, radius: 0.028 },
    wave: { amp: 0.035, waves: 1.3, speed: 1.0, flap: 0.0 },
    belly: '#e8e2d8',
    paint(ctx, b, W, H) {
      // Olive-tan disc with electric-blue spots and bright blue tail stripes.
      const g = ctx.createRadialGradient(W * 0.55, H / 2, 10, W * 0.5, H / 2, W * 0.5);
      g.addColorStop(0, '#b89a5c');
      g.addColorStop(1, '#8a6c3a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      let s = 11;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 160; i++) {
        const x = r() * W * 0.62 + W * 0.38;
        const y = r() * H;
        const rad = 4 + r() * 9;
        ctx.fillStyle = '#1c7cff';
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,230,255,0.6)';
        ctx.beginPath();
        ctx.arc(x - rad * 0.25, y - rad * 0.25, rad * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tail: two blue stripes along its length (tail occupies left strip).
      ctx.fillStyle = '#8a6c3a';
      ctx.fillRect(0, 0, W * 0.36, H);
      ctx.fillStyle = '#2a8cff';
      ctx.fillRect(0, H * 0.3, W * 0.36, H * 0.12);
      ctx.fillRect(0, H * 0.58, W * 0.36, H * 0.12);
      // Eyes: raised, dark with golden rims.
      for (const ey of [0.42, 0.58]) {
        ctx.fillStyle = '#e0b040';
        ctx.beginPath();
        ctx.arc(W * 0.9, H * ey, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#101010';
        ctx.beginPath();
        ctx.arc(W * 0.9, H * ey, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  eagleRay: {
    name: 'Spotted eagle ray',
    latin: 'Aetobatus ocellatus',
    length: 0.9,
    halfWidth: [[0.62, 0.0], [0.52, 0.06], [0.4, 0.12], [0.25, 0.38], [0.05, 0.72], [-0.1, 0.94], [-0.16, 1.0], [-0.21, 0.62], [-0.28, 0.26], [-0.4, 0.1], [-0.5, 0.0]],
    thickness: 0.09,
    tail: { length: 2.4, radius: 0.018 },
    wave: { amp: 0.32, waves: 0.35, speed: 0.55, flap: 1.0 },
    belly: '#f4f4f0',
    paint(ctx, b, W, H) {
      // Deep navy back covered in white ringed spots.
      ctx.fillStyle = '#1a2436';
      ctx.fillRect(0, 0, W, H);
      let s = 5;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 420; i++) {
        const x = r() * W * 0.7 + W * 0.3;
        const y = r() * H;
        const rad = 2.5 + r() * 5;
        ctx.fillStyle = 'rgba(245,248,255,0.95)';
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
        if (rad > 5.5) {
          ctx.fillStyle = '#1a2436';
          ctx.beginPath();
          ctx.arc(x, y, rad * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Paler, duck-bill head.
      const g = ctx.createLinearGradient(W * 0.88, 0, W, 0);
      g.addColorStop(0, 'rgba(60,70,90,0)');
      g.addColorStop(1, 'rgba(70,80,100,1)');
      ctx.fillStyle = g;
      ctx.fillRect(W * 0.88, 0, W * 0.12, H);
      ctx.fillStyle = '#1a2436';
      ctx.fillRect(0, 0, W * 0.3, H);
    },
  },
};

/**
 * Build geometry + material for a ray species. Attributes:
 *   aSpan: signed spanwise position (-1 left tip .. 1 right tip)
 *   aPart: 0 disc, 1 tail (tail t in aSpan's place for the tail)
 */
export function buildRay(spec) {
  const halfW = monotone(spec.halfWidth);
  const xmax = spec.halfWidth[0][0];
  const xmin = -0.5;
  const tailLen = spec.tail.length;
  const NX = 48, NS = 40;
  const pos = [], uv = [], span = [], part = [], idx = [];
  // Texture covers x from (xmin - tailLen) to xmax, z from -maxW to maxW.
  const maxW = Math.max(...spec.halfWidth.map((p) => p[1]));
  const u0 = xmin - tailLen;
  const uOf = (x) => (x - u0) / (xmax - u0);
  // Squash the tail into the left 36% of the texture.
  const texU = (x) => (x >= xmin ? 0.36 + 0.64 * (x - xmin) / (xmax - xmin) : 0.36 * (x - u0) / (xmin - u0));
  void uOf;
  for (const top of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NX; i++) {
      const x = xmax - (i / NX) * (xmax - xmin);
      const w = Math.max(halfW(x), 0.0005);
      const bodyT = spec.thickness * Math.pow(Math.max(0, 1 - Math.pow((x - 0.08) / 0.6, 2)), 0.6);
      for (let j = 0; j <= NS; j++) {
        const s = (j / NS) * 2 - 1;
        const z = s * w;
        // Thick along the midline, thin at the fin margin.
        const prof = Math.pow(Math.max(0, 1 - s * s), 0.8) * bodyT + 0.002;
        const y = top > 0 ? prof : -prof * 0.45;
        pos.push(x, y, z);
        uv.push(texU(x), 0.5 + z / (2 * maxW));
        span.push(s);
        part.push(top > 0 ? 0 : 0.5);
      }
    }
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NS; j++) {
        const a = base + i * (NS + 1) + j, b = a + NS + 1;
        if (top > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // Tail: tapered tube.
  const TS = 40, TR = 6;
  const tb = pos.length / 3;
  for (let i = 0; i <= TS; i++) {
    const t = i / TS;
    const x = xmin + 0.02 - t * tailLen;
    const r = spec.tail.radius * (1 - 0.85 * t) + 0.001;
    for (let j = 0; j < TR; j++) {
      const a = (j / TR) * Math.PI * 2;
      pos.push(x, Math.sin(a) * r * 0.8 + 0.005, Math.cos(a) * r);
      uv.push(texU(x), 0.5 + (Math.cos(a) * r) / (2 * maxW) * 6);
      span.push(t);
      part.push(1);
    }
  }
  for (let i = 0; i < TS; i++) {
    for (let j = 0; j < TR; j++) {
      const a = tb + i * TR + j, b = tb + i * TR + ((j + 1) % TR);
      idx.push(a, b, a + TR, b, b + TR, a + TR);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  spec.paint(canvas.getContext('2d'), null, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const uniforms = {
    uRayAmp: { value: spec.wave.amp },
    uRayWaves: { value: spec.wave.waves },
    uRayFlap: { value: spec.wave.flap },
    uBelly: { value: new THREE.Color(spec.belly) },
  };
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
  underwater(mat);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSpan;
        attribute float aPart;
        uniform float uRayAmp, uRayWaves, uRayFlap;
        #ifdef USE_INSTANCING
        attribute vec3 aRay; // phase, amplitude scale, tail sway
        #else
        const vec3 aRay = vec3(0.0, 1.0, 0.0);
        #endif
        varying float vBelly;
        float rayWave(float x, float s) {
          // Ribbontail: waves travel nose->tail along the margin.
          // Eagle ray: near-synchronous flap with a slight trailing lag.
          float ph = aRay.x - x * uRayWaves * 6.2831;
          float edge = pow(abs(s), mix(1.6, 1.3, uRayFlap));
          return uRayAmp * aRay.y * edge * sin(ph);
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        if (aPart < 0.75) {
          // Tilt normals with the local fin slope (spanwise derivative).
          float e = 0.02;
          float d = (rayWave(position.x, aSpan + e) - rayWave(position.x, aSpan - e)) / (2.0 * e);
          objectNormal = normalize(objectNormal + vec3(0.0, 0.0, -d * sign(objectNormal.y + 1e-4) * 0.8));
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBelly = aPart > 0.25 && aPart < 0.75 ? 1.0 : 0.0;
        if (aPart < 0.75) {
          transformed.y += rayWave(position.x, aSpan);
        } else {
          // Tail trails and sways.
          float t = aSpan;
          transformed.z += sin(aRay.x * 0.5 - t * 4.0) * 0.05 * t * (0.5 + aRay.z);
          transformed.y += sin(aRay.x * 0.5 - t * 3.0 + 1.0) * 0.03 * t;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBelly;\nvarying float vBelly;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, uBelly, vBelly);');
  };
  mat.customProgramCacheKey = () => 'ray';
  return { spec, geometry: geo, material: mat, scale: spec.length };
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A group of rays wandering between waypoints.
 * mode 'bottom': cruise close to the sand, sometimes settle and rest.
 * mode 'cruise': fly in a loose formation at mid-depth.
 */
export class RayGroup {
  constructor(built, o) {
    this.built = built;
    this.o = {
      count: 3,
      mode: 'bottom',
      speed: 0.35,
      height: 0.35,
      region: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      pickTarget: null, // (rng) => Vector3 | null
      groundFn: () => 0,
      maxY: 6,
      sizeVar: 0.15,
      rng: Math.random,
      ...o,
    };
    const n = this.o.count;
    const geo = built.geometry.clone();
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('aRay', this.attr);
    this.mesh = new THREE.InstancedMesh(geo, built.material, n);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = built.spec.name;
    this.agents = [];
    for (let i = 0; i < n; i++) {
      const p = this._randomPoint();
      p.y = this.o.groundFn(p.x, p.z) + this.o.height;
      this.agents.push({
        pos: p,
        vel: new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, this.o.rng() * 6.28).multiplyScalar(this.o.speed),
        quat: new THREE.Quaternion(),
        target: this._randomPoint(),
        phase: this.o.rng() * 10,
        rest: 0,
        bank: 0,
        scale: built.scale * (1 + (this.o.rng() - 0.5) * 2 * this.o.sizeVar),
      });
    }
    // Cruisers follow the first ray in a loose V.
    this.update(0.016, 0);
  }

  _randomPoint() {
    const o = this.o;
    for (let k = 0; k < 20; k++) {
      const p = o.pickTarget ? o.pickTarget(o.rng) : null;
      if (p) return p;
      const q = new THREE.Vector3(
        o.region.minX + o.rng() * (o.region.maxX - o.region.minX),
        0,
        o.region.minZ + o.rng() * (o.region.maxZ - o.region.minZ),
      );
      if (!o.pickTarget) return q;
    }
    return new THREE.Vector3((o.region.minX + o.region.maxX) / 2, 0, (o.region.minZ + o.region.maxZ) / 2);
  }

  update(dt, time) {
    const o = this.o;
    dt = Math.min(dt, 0.05);
    const lead = this.agents[0];
    this.agents.forEach((a, i) => {
      if (o.static) {
        // Display mode: hold the pose and keep swimming in place.
        a.phase += dt * (o.mode === 'cruise' ? 0.55 : 1.4) * Math.PI * 2;
        this.attr.setXYZ(i, a.phase, 1, 0);
        _s.setScalar(a.scale);
        _m.compose(a.pos, a.quat, _s);
        this.mesh.setMatrixAt(i, _m);
        return;
      }
      let goal;
      if (o.mode === 'cruise' && i > 0) {
        // Formation slot behind and to the side of the leader.
        _f.copy(lead.vel).normalize();
        _r.crossVectors(_f, UP).normalize();
        const side = i % 2 ? 1 : -1;
        const rank = Math.ceil(i / 2);
        goal = lead.pos.clone().addScaledVector(_f, -1.6 * rank).addScaledVector(_r, side * 1.4 * rank);
        goal.y += 0.3 * Math.sin(time * 0.3 + i);
      } else {
        const g = o.groundFn(a.target.x, a.target.z);
        goal = a.target.clone();
        goal.y = o.mode === 'cruise' ? Math.min(o.maxY, g + o.height) : g + o.height;
      }
      const toGoal = goal.clone().sub(a.pos);
      const dist = toGoal.length();
      if (i === 0 || o.mode !== 'cruise') {
        if (dist < 1.2) {
          a.target = this._randomPoint();
          if (o.mode === 'bottom' && o.rng() < 0.45) a.rest = 6 + o.rng() * 12;
        }
      }
      let speed = o.speed;
      let restAmp = 1;
      if (a.rest > 0) {
        // Settle onto the sand and stop, with just a slow edge ripple.
        a.rest -= dt;
        const g = o.groundFn(a.pos.x, a.pos.z) + 0.05;
        a.pos.y += (g - a.pos.y) * Math.min(1, dt * 1.2);
        a.vel.multiplyScalar(Math.exp(-dt * 2));
        speed = 0;
        restAmp = 0.25;
      } else {
        const desired = toGoal.normalize().multiplyScalar(i > 0 && o.mode === 'cruise' ? Math.min(o.speed * 1.4, dist * 0.6 + o.speed * 0.6) : speed);
        const steer = desired.sub(a.vel);
        const maxA = o.mode === 'cruise' ? 0.25 : 0.35;
        if (steer.length() > maxA) steer.setLength(maxA);
        a.vel.addScaledVector(steer, dt);
        // Stay off the bottom.
        const g = o.groundFn(a.pos.x, a.pos.z);
        const minY = g + (o.mode === 'bottom' ? 0.12 : 1.5);
        if (a.pos.y < minY) a.vel.y += (minY - a.pos.y) * dt * 3;
      }
      const prevYaw = Math.atan2(a.vel.z, a.vel.x);
      a.pos.addScaledVector(a.vel, dt);
      const sp = a.vel.length();
      // Orientation: face velocity (keep last heading when stopped).
      if (sp > 0.02) {
        _f.copy(a.vel).normalize();
        _f.y = THREE.MathUtils.clamp(_f.y, -0.35, 0.35);
        _f.normalize();
        _r.crossVectors(_f, UP).normalize();
        _u.crossVectors(_r, _f).normalize();
        _m.makeBasis(_f, _u, _r);
        _q.setFromRotationMatrix(_m);
        let dy = Math.atan2(a.vel.z, a.vel.x) - prevYaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        a.bank += (THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.8, -0.5, 0.5) - a.bank) * Math.min(1, dt * 2);
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a.bank));
        a.quat.slerp(_q, Math.min(1, dt * 2.5));
      } else {
        // Level out when resting.
        _f.set(1, 0, 0).applyQuaternion(a.quat);
        _f.y = 0;
        _f.normalize();
        _r.crossVectors(_f, UP).normalize();
        _m.makeBasis(_f, UP, _r);
        _q.setFromRotationMatrix(_m);
        a.quat.slerp(_q, Math.min(1, dt * 2));
      }
      // Fin-beat frequency grows with speed.
      const freq = o.mode === 'cruise' ? 0.35 + sp * 0.4 : 0.8 + sp * 2.5;
      a.phase += dt * freq * Math.PI * 2;
      this.attr.setXYZ(i, a.phase, (0.35 + Math.min(1, sp / Math.max(o.speed, 0.01)) * 0.65) * restAmp, a.bank);
      _s.setScalar(a.scale);
      _m.compose(a.pos, a.quat, _s);
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.needsUpdate = true;
  }
}
