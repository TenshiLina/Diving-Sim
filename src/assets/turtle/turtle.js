// Green sea turtle (Chelonia mydas).
//
// Built as a small rig: shell (carapace + plastron), head and four flippers,
// each flipper on its own pivot so the classic "underwater flight" stroke
// (front flippers sweep down-and-back together, rear flippers steer) can be
// driven from JS. Shell scutes and skin scales are procedural.

import * as THREE from 'three';
import { SimplexNoise } from '../../util/noise.js';
import { proceduralSurface } from '../materials.js';
import { underwater } from '../../water/underwater.js';

function shellMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  underwater(mat);
  proceduralSurface(mat, {
    key: 'turtleShell',
    glsl: /* glsl */ `
      // Scutes: Voronoi plates on the carapace, pale seams between them,
      // tortoiseshell streaks radiating inside each plate.
      float surfH(vec3 p) {
        if (p.y < 0.0) return 0.0;
        vec2 c = cellular(vec3(p.x * 5.5, 0.0, p.z * 6.5));
        return smoothstep(0.0, 0.12, c.y - c.x) * 0.006;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        if (p.y < 0.0) {
          // Plastron: pale creamy yellow plates.
          vec2 c = cellular(vec3(p.x * 4.0, 0.0, p.z * 5.0));
          return vec3(0.85, 0.78, 0.55) * (0.85 + 0.15 * smoothstep(0.0, 0.1, c.y - c.x));
        }
        vec2 c = cellular(vec3(p.x * 5.5, 0.0, p.z * 6.5));
        float seam = 1.0 - smoothstep(0.0, 0.06, c.y - c.x);
        float streak = snoise(vec3(atan(p.z, p.x) * 3.0, length(p.xz) * 18.0, 1.0)) * 0.5 + 0.5;
        vec3 dark = vec3(0.22, 0.16, 0.08);
        vec3 amber = vec3(0.55, 0.38, 0.14);
        vec3 olive = vec3(0.38, 0.36, 0.18);
        vec3 col = mix(dark, amber, smoothstep(0.3, 0.8, streak));
        col = mix(col, olive, smoothstep(0.2, 0.7, snoise(p * 6.0)) * 0.5);
        col = mix(col, vec3(0.8, 0.72, 0.5), seam * 0.8);
        // Faint algal film on older shells.
        col = mix(col, vec3(0.3, 0.38, 0.22), smoothstep(0.4, 0.9, snoise(p * 3.0 + 4.0)) * 0.35);
        return col;
      }
    `,
  });
  return mat;
}

function skinMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  underwater(mat);
  proceduralSurface(mat, {
    key: 'turtleSkin',
    glsl: /* glsl */ `
      // Polygonal scales: dark brown centres with pale cream borders.
      float surfH(vec3 p) {
        vec2 c = cellular(p * 38.0);
        return smoothstep(0.0, 0.2, c.y - c.x) * 0.0015;
      }
      vec3 surfCol(vec3 base, vec3 p, float h) {
        vec2 c = cellular(p * 38.0);
        float border = 1.0 - smoothstep(0.0, 0.14, c.y - c.x);
        vec3 scale = mix(vec3(0.3, 0.22, 0.12), vec3(0.45, 0.34, 0.16), snoise(p * 20.0) * 0.5 + 0.5);
        return mix(scale, vec3(0.88, 0.84, 0.7), border * 0.85) * base;
      }
    `,
  });
  return mat;
}

function flipperGeometry(len, width, thick, curve, side) {
  // Paddle: a flattened, tapered, gently curved blade along +x from its root.
  const geo = new THREE.SphereGeometry(1, 28, 12);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) + 1) / 2; // 0 root .. 1 tip
    const w = width * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1)) * (1 - 0.55 * u);
    const x = u * len;
    const y = p.getY(i) * thick * (1 - 0.6 * u);
    const z = p.getZ(i) * w + side * curve * len * u * u; // swept back toward the tail (after rotation)
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Build one turtle rig. Returns { group, flippers, head, update(dt, speed) }. */
export function createTurtle({ length = 1.0, seed = 2 } = {}) {
  const noise = new SimplexNoise(seed);
  const L = length;
  const group = new THREE.Group();
  group.name = 'Green sea turtle';
  const shellMat = shellMaterial();
  const skinMat = skinMaterial();

  // Carapace (domed, tapering to the rear) + plastron (flat).
  const shellGeo = new THREE.SphereGeometry(1, 64, 32);
  const sp = shellGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const taper = 1 - 0.25 * Math.max(0, -x); // narrower toward the tail
    const heart = 1 - 0.1 * Math.max(0, x) ** 3;
    y = y > 0 ? y * 0.24 * (1 - 0.15 * x * x) : y * 0.12;
    z *= 0.4 * taper * heart;
    x *= 0.5;
    y += 0.004 * noise.noise3(x * 8, y * 8, z * 8);
    sp.setXYZ(i, x * L, y * L, z * L);
  }
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  // Head on a short neck.
  const headPivot = new THREE.Group();
  headPivot.position.set(0.47 * L, 0.02 * L, 0);
  group.add(headPivot);
  const headGeo = new THREE.SphereGeometry(1, 32, 20);
  const hp = headGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    // Blunt, slightly beaked snout.
    const k = x > 0 ? 1 - 0.25 * x * x : 1;
    hp.setXYZ(i, (x * 0.13 + 0.09) * L, y * 0.065 * k * L, z * 0.07 * k * L);
  }
  headGeo.computeVertexNormals();
  const head = new THREE.Mesh(headGeo, skinMat);
  head.castShadow = true;
  headPivot.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.15 });
  underwater(eyeMat);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014 * L, 12, 8), eyeMat);
    eye.position.set(0.16 * L, 0.022 * L, s * 0.05 * L);
    headPivot.add(eye);
  }

  // Flippers: long front "wings", small rear paddles.
  const flippers = [];
  const mk = (x, z, side, len, width, rear) => {
    const pivot = new THREE.Group();
    pivot.position.set(x * L, -0.01 * L, side * z * L);
    const geo = flipperGeometry(len * L, width * L, 0.028 * L, rear ? 0.1 : 0.3, side);
    const m = new THREE.Mesh(geo, skinMat);
    m.castShadow = true;
    // Point the blade outward (±z) and angled back toward the tail.
    const a = rear ? 0.8 : 0.35;
    m.rotation.y = side > 0 ? -Math.PI / 2 - a : Math.PI / 2 + a;
    pivot.add(m);
    group.add(pivot);
    flippers.push({ pivot, side, rear });
  };
  mk(0.26, 0.2, 1, 0.58, 0.17, false);
  mk(0.26, 0.2, -1, 0.58, 0.17, false);
  mk(-0.36, 0.13, 1, 0.24, 0.1, true);
  mk(-0.36, 0.13, -1, 0.24, 0.1, true);

  let phase = seed * 1.7;
  const update = (dt, stroke = 1, time = 0) => {
    // stroke 0 = resting / gliding, 1 = full power stroke.
    phase += dt * (0.25 + 0.3 * stroke) * Math.PI * 2;
    const s = Math.sin(phase);
    for (const f of flippers) {
      if (!f.rear) {
        // Down-and-back power stroke with feathering on the recovery.
        f.pivot.rotation.set(f.side * (0.15 + 0.75 * stroke * s), -f.side * 0.35 * stroke * Math.cos(phase), 0.25 * stroke * Math.cos(phase));
      } else {
        f.pivot.rotation.set(f.side * 0.15 * Math.sin(phase * 0.5 + 1), 0, 0.2 * stroke * Math.sin(phase + 1));
      }
    }
    headPivot.rotation.set(0, 0.12 * Math.sin(time * 0.4 + seed), 0.06 * Math.sin(time * 0.3));
  };
  update(0, 1);
  return { group, flippers, update };
}

// ---------------------------------------------------------------------------

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** A turtle wandering the reef: cruises, glides, sometimes rests on the bottom. */
export class TurtleAgent {
  constructor({ groundFn, pickTarget, rng, maxY = 7, speed = 0.35, length = 1, seed = 1, start }) {
    this.rig = createTurtle({ length, seed });
    this.group = this.rig.group;
    this.groundFn = groundFn;
    this.pickTarget = pickTarget;
    this.rng = rng;
    this.maxY = maxY;
    this.speed = speed;
    this.pos = start.clone();
    this.pos.y = Math.min(this.pos.y, maxY);
    this.vel = new THREE.Vector3(speed, 0, 0);
    this.target = pickTarget(rng);
    this.rest = 0;
    this.bank = 0;
    this.stroke = 1;
    this.group.position.copy(this.pos);
  }

  update(dt, time) {
    dt = Math.min(dt, 0.05);
    const g = this.groundFn(this.pos.x, this.pos.z);
    if (this.rest > 0) {
      this.rest -= dt;
      this.pos.y += (g + 0.12 - this.pos.y) * Math.min(1, dt);
      this.vel.multiplyScalar(Math.exp(-dt * 1.5));
      this.stroke += (0 - this.stroke) * Math.min(1, dt);
    } else {
      const goal = this.target.clone();
      goal.y = Math.min(this.maxY, this.groundFn(goal.x, goal.z) + goal.y);
      const to = goal.sub(this.pos);
      if (to.length() < 1.5) {
        this.target = this.pickTarget(this.rng);
        if (this.rng() < 0.3) this.rest = 8 + this.rng() * 12;
      }
      const desired = to.normalize().multiplyScalar(this.speed);
      const steer = desired.sub(this.vel).clampLength(0, 0.15);
      this.vel.addScaledVector(steer, dt);
      const floor = Math.min(g + 0.8, this.maxY - 0.2);
      if (this.pos.y < floor) this.vel.y += (floor - this.pos.y) * dt;
      if (this.pos.y > this.maxY) this.vel.y -= (this.pos.y - this.maxY) * dt * 2;
      // Alternate power strokes and glides.
      const want = Math.sin(time * 0.15 + this.rig.flippers.length) > -0.3 ? 1 : 0.15;
      this.stroke += (want - this.stroke) * Math.min(1, dt * 0.8);
    }
    const prevYaw = Math.atan2(this.vel.z, this.vel.x);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.min(this.pos.y, this.maxY);
    if (this.vel.length() > 0.03) {
      _f.copy(this.vel).normalize();
      _f.y = THREE.MathUtils.clamp(_f.y, -0.3, 0.3);
      _f.normalize();
      _r.crossVectors(_f, UP).normalize();
      _u.crossVectors(_r, _f).normalize();
      _m.makeBasis(_f, _u, _r);
      _q.setFromRotationMatrix(_m);
      let dy = Math.atan2(this.vel.z, this.vel.x) - prevYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.bank += (THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3), -0.4, 0.4) - this.bank) * Math.min(1, dt * 2);
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.bank));
      this.group.quaternion.slerp(_q, Math.min(1, dt * 1.5));
    }
    this.group.position.copy(this.pos);
    this.rig.update(dt, this.stroke, time);
  }
}
