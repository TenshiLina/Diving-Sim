// Instanced fish group with simple boid steering.
//
// Behaviour knobs let one class cover a hovering clownfish pair, a loose tang
// group and a tight chromis school.

import * as THREE from 'three';
import { Rng } from '../../util/noise.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class FishSchool {
  /**
   * @param {ReturnType<import('./fishBuilder.js').buildFishSpecies>} built
   * @param {object} o
   */
  constructor(built, o = {}) {
    this.built = built;
    this.o = {
      count: 8,
      home: new THREE.Vector3(0, 2, 0),
      homeRadius: 3,
      homeStrength: 0.6,
      speed: [0.15, 0.45],
      cruise: 0.3,
      neighbor: 1.2,
      separation: 0.25,
      wSep: 2.5,
      wAli: 0.6,
      wCoh: 0.4,
      wander: 0.6,
      maxAccel: 1.2,
      minHeight: 0.25,
      maxY: 6.5,
      sizeVar: 0.15,
      seed: 1,
      groundFn: () => 0,
      obstacles: [],
      maxPitch: 0.5,
      ...o,
    };
    const n = this.o.count;
    const rng = new Rng(this.o.seed);
    this.rng = rng;
    const body = built.body.clone();
    const fins = built.fins.clone();
    const swim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    swim.setUsage(THREE.DynamicDrawUsage);
    body.setAttribute('aSwim', swim);
    fins.setAttribute('aSwim', swim);
    this.swim = swim;
    this.bodyMesh = new THREE.InstancedMesh(body, built.bodyMat, n);
    this.finMesh = new THREE.InstancedMesh(fins, built.finMat, n);
    this.finMesh.instanceMatrix = this.bodyMesh.instanceMatrix;
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const m of [this.bodyMesh, this.finMesh]) {
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
    }
    this.finMesh.castShadow = false;
    this.group = new THREE.Group();
    this.group.name = built.spec.name;
    this.group.add(this.bodyMesh, this.finMesh);

    this.pos = [];
    this.vel = [];
    this.quat = [];
    this.scale = [];
    this.phase = [];
    this.wanderDir = [];
    this.yawRate = [];
    for (let i = 0; i < n; i++) {
      const p = this.o.home.clone().add(new THREE.Vector3(rng.gauss(0, 1), rng.gauss(0, 0.4), rng.gauss(0, 1)).multiplyScalar(this.o.homeRadius * 0.5));
      this.pos.push(p);
      const d = new THREE.Vector3(rng.float(-1, 1), rng.float(-0.1, 0.1), rng.float(-1, 1)).normalize();
      this.vel.push(d.multiplyScalar(this.o.cruise));
      this.quat.push(new THREE.Quaternion());
      this.scale.push(built.scale * (1 + rng.gauss(0, this.o.sizeVar)));
      this.phase.push(rng.float(0, 100));
      this.wanderDir.push(new THREE.Vector3(rng.float(-1, 1), rng.float(-0.2, 0.2), rng.float(-1, 1)).normalize());
      this.yawRate.push(0);
      this._orient(i, 1);
    }
    this.update(0.016, 0);
  }

  _orient(i, k) {
    const v = this.vel[i];
    _f.copy(v);
    if (_f.lengthSq() < 1e-8) _f.set(1, 0, 0);
    _f.normalize();
    // Limit pitch.
    const mp = this.o.maxPitch;
    const horiz = Math.hypot(_f.x, _f.z);
    let pitch = Math.atan2(_f.y, horiz);
    pitch = Math.max(-mp, Math.min(mp, pitch));
    const yaw = Math.atan2(_f.z, _f.x);
    _f.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    _r.crossVectors(_f, UP).normalize(); // local z
    _u.crossVectors(_r, _f).normalize(); // local y
    _m.makeBasis(_f, _u, _r);
    _q.setFromRotationMatrix(_m);
    // Bank into turns.
    const bank = THREE.MathUtils.clamp(-this.yawRate[i] * 0.25, -0.5, 0.5);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bank));
    this.quat[i].slerp(_q, k);
  }

  update(dt, time) {
    const o = this.o;
    const n = o.count;
    dt = Math.min(dt, 0.05);
    for (let i = 0; i < n; i++) {
      const p = this.pos[i];
      const v = this.vel[i];
      if (o.static) {
        // Display mode: hold position/heading, keep swimming in place.
        this._pose(i, dt, o.cruise);
        continue;
      }
      _a.set(0, 0, 0);
      // Boids
      const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3();
      let cnt = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        _v.subVectors(p, this.pos[j]);
        const d = _v.length();
        if (d < o.neighbor) {
          cnt++;
          ali.add(this.vel[j]);
          coh.add(this.pos[j]);
          if (d < o.separation) sep.addScaledVector(_v, (o.separation - d) / Math.max(d, 1e-3));
        }
      }
      if (cnt > 0) {
        ali.divideScalar(cnt).sub(v);
        coh.divideScalar(cnt).sub(p);
        _a.addScaledVector(ali, o.wAli).addScaledVector(coh, o.wCoh);
      }
      _a.addScaledVector(sep, o.wSep);
      // Wander: slowly rotating preferred direction.
      const w = this.wanderDir[i];
      w.x += this.rng.gauss(0, 0.6) * dt;
      w.y += this.rng.gauss(0, 0.2) * dt - w.y * 0.5 * dt;
      w.z += this.rng.gauss(0, 0.6) * dt;
      w.normalize();
      _a.addScaledVector(w, o.wander * o.cruise);
      // Home
      _v.subVectors(o.home, p);
      const dh = _v.length();
      if (dh > o.homeRadius * 0.5) _a.addScaledVector(_v.normalize(), o.homeStrength * (dh / o.homeRadius));
      // Ground / surface
      const g = o.groundFn(p.x, p.z) + o.minHeight;
      if (p.y < g + 0.3) _a.y += (g + 0.3 - p.y) * 4;
      if (p.y > o.maxY) _a.y -= (p.y - o.maxY) * 2;
      // Obstacles (spheres): steer around
      for (const ob of o.obstacles) {
        _v.subVectors(p, ob.center);
        const d = _v.length();
        const r = ob.radius + 0.1;
        if (d < r * 1.4) _a.addScaledVector(_v.normalize(), ((r * 1.4 - d) / r) * 3.0);
      }
      // Speed regulation toward cruise
      const sp = v.length();
      _a.addScaledVector(v, ((o.cruise - sp) / Math.max(sp, 1e-3)) * 0.8);
      // Clamp accel
      const al = _a.length();
      if (al > o.maxAccel) _a.multiplyScalar(o.maxAccel / al);

      const prevYaw = Math.atan2(v.z, v.x);
      v.addScaledVector(_a, dt);
      const nsp = v.length();
      if (nsp > o.speed[1]) v.multiplyScalar(o.speed[1] / nsp);
      if (nsp < o.speed[0]) v.multiplyScalar(o.speed[0] / Math.max(nsp, 1e-4));
      let dy = Math.atan2(v.z, v.x) - prevYaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      this.yawRate[i] += ((dt > 0 ? dy / dt : 0) - this.yawRate[i]) * Math.min(1, dt * 4);
      p.addScaledVector(v, dt);

      this._orient(i, Math.min(1, dt * 5));
      this._pose(i, dt, v.length());
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.swim.needsUpdate = true;
    this.built.swimUniforms.uFinTime.value = time;
  }

  // Advance the swim cycle and write the instance matrix.
  _pose(i, dt, speed) {
    {
      const p = this.pos[i];
      // Swim cycle: tail beat frequency scales with speed / body length.
      const L = this.scale[i];
      const speedBL = speed / L; // body lengths per second
      const freq = 1.2 + speedBL * 0.9; // Hz
      this.phase[i] += dt * freq * Math.PI * 2;
      const amp = 0.55 + Math.min(1.0, speedBL * 0.18);
      // Body bends into the turn.
      const bend = THREE.MathUtils.clamp(this.yawRate[i] * 0.06, -0.12, 0.12);
      this.swim.setXYZ(i, this.phase[i], amp, bend);

      _s.setScalar(L);
      _m.compose(p, this.quat[i], _s);
      this.bodyMesh.setMatrixAt(i, _m);
    }
  }

  /** Place fish i at a fixed pose (display mode). */
  setPose(i, position, yaw = 0) {
    this.pos[i].copy(position);
    this.quat[i].setFromAxisAngle(UP, yaw);
    this.vel[i].set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(this.o.cruise);
  }
}
