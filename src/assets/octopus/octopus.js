// Day octopus (Octopus cyanea) — the reef's master of disguise.
//
// The mantle and head are a static mesh; the eight arms are rebuilt on the CPU
// every frame from procedural centre-lines, blending three poses:
//   * sit   — arms spread over the reef, tips slowly curling,
//   * crawl — arms reach and lift in a travelling gait while the body creeps,
//   * jet   — mantle first, arms trailing in a pulsing bundle.
// Skin coordinates travel with the arms so the mottling never slides, and the
// colour shifts between reef camouflage and a dark display with "passing
// cloud" bands.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../util/noise.js';
import { SIMPLEX3, CELLULAR3, PERTURB_NORMAL } from '../../util/glsl.js';
import { underwater, water } from '../../water/underwater.js';

const ARMS = 8;
const SEG = 20;
const RAD = 7;

function skinMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  underwater(mat);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms, { uOctoTime: water.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSkin;\nvarying vec4 vSkin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vSkin; // xyz: skin-space coords, w: 1 on the arm underside (suckers)
        uniform vec3 uCamoA, uCamoB;
        uniform float uDisplay, uOctoTime;
        ${SIMPLEX3}
        ${CELLULAR3}
        ${PERTURB_NORMAL}
        float octoH;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 q = vSkin.xyz;
          vec2 c = cellular(q * 55.0);
          float papillae = smoothstep(0.5, 0.1, c.x);
          float mottle = snoise(q * 14.0) * 0.5 + 0.5;
          vec3 camo = mix(uCamoA, uCamoB, smoothstep(0.3, 0.75, mottle));
          camo = mix(camo, camo * 1.35 + 0.05, papillae * 0.35);
          // Display: dark red-brown with pale spots and bands sweeping over the skin.
          vec3 disp = vec3(0.32, 0.1, 0.07);
          disp = mix(disp, vec3(0.8, 0.72, 0.6), smoothstep(0.22, 0.1, cellular(q * 22.0).x) * 0.8);
          float cloud = 0.5 + 0.5 * sin(dot(q, vec3(30.0, 8.0, 30.0)) - uOctoTime * 5.0);
          disp *= mix(0.45, 1.0, cloud);
          vec3 col = mix(camo, disp, uDisplay);
          // Pale suckers along the underside of the arms.
          float sucker = smoothstep(0.4, 0.2, cellular(vec3(q.x * 80.0, q.y * 20.0, q.z * 80.0)).x);
          col = mix(col, vec3(0.92, 0.85, 0.78), vSkin.w * (0.45 + 0.4 * sucker));
          diffuseColor.rgb = col;
          octoH = papillae * 0.0012 * (1.0 - vSkin.w) + vSkin.w * sucker * 0.0008;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n normal = perturbNormalH(-vViewPosition, normal, octoH, faceDirection);',
      );
  };
  mat.customProgramCacheKey = () => 'octopus';
  return mat;
}

export class Octopus {
  constructor({ size = 1, seed = 1, camo = ['#6a5a3c', '#a89468'] } = {}) {
    this.size = size;
    const rng = new Rng(seed);
    this.rng = rng;
    this.uniforms = {
      uCamoA: { value: new THREE.Color(camo[0]) },
      uCamoB: { value: new THREE.Color(camo[1]) },
      uDisplay: { value: 0 },
    };
    const mat = skinMaterial(this.uniforms);
    this.group = new THREE.Group();
    this.group.name = 'Day octopus';
    this.pivot = new THREE.Group(); // tilt / flip for jetting
    this.group.add(this.pivot);

    // --- Mantle + head ---------------------------------------------------------
    const mantle = new THREE.SphereGeometry(1, 36, 24);
    const mp = mantle.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i);
      // Pear-shaped bag, narrowing where it joins the head.
      const k = 1 - 0.25 * Math.max(0, x);
      mp.setXYZ(i, x * 0.1 * size, y * 0.07 * k * size, z * 0.075 * k * size);
    }
    mantle.rotateZ(-0.55);
    mantle.translate(-0.075 * size, 0.12 * size, 0);
    const head = new THREE.SphereGeometry(0.055 * size, 24, 16);
    head.scale(1, 0.8, 1.05);
    head.translate(0.0, 0.065 * size, 0);
    const bodyGeo = mergeGeometries([mantle, head].map((g) => g.toNonIndexed()));
    const bp = bodyGeo.attributes.position;
    const skin = new Float32Array(bp.count * 4);
    for (let i = 0; i < bp.count; i++) {
      skin[i * 4] = bp.getX(i) / size;
      skin[i * 4 + 1] = bp.getY(i) / size;
      skin[i * 4 + 2] = bp.getZ(i) / size;
    }
    bodyGeo.setAttribute('aSkin', new THREE.BufferAttribute(skin, 4));
    bodyGeo.computeVertexNormals();
    this.body = new THREE.Mesh(bodyGeo, mat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.pivot.add(this.body);
    // Eyes: raised bumps with a dark horizontal pupil.
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9a8040, roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
    underwater(eyeMat);
    underwater(pupilMat);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012 * size, 14, 10), eyeMat);
      eye.position.set(0.025 * size, 0.1 * size, s * 0.038 * size);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.012 * size, 0.003 * size, 0.004 * size), pupilMat);
      pupil.position.set(0.003 * size, 0, s * 0.01 * size);
      eye.add(pupil);
      this.pivot.add(eye);
    }

    // --- Arms (dynamic) -----------------------------------------------------------
    this.arms = [];
    for (let a = 0; a < ARMS; a++) {
      this.arms.push({
        angle: ((a + 0.5) / ARMS) * Math.PI * 2 + rng.float(-0.12, 0.12),
        length: size * rng.float(0.38, 0.5),
        phase: rng.float(0, Math.PI * 2),
        curl: rng.float(0.6, 1.4) * (rng.next() < 0.5 ? -1 : 1),
      });
    }
    const vertsPerArm = (SEG + 1) * RAD + 1;
    const n = ARMS * vertsPerArm;
    this.armPos = new Float32Array(n * 3);
    this.armNrm = new Float32Array(n * 3);
    const armSkin = new Float32Array(n * 4);
    const idx = [];
    for (let a = 0; a < ARMS; a++) {
      const base = a * vertsPerArm;
      for (let i = 0; i <= SEG; i++) {
        for (let j = 0; j < RAD; j++) {
          const k = base + i * RAD + j;
          const th = (j / RAD) * Math.PI * 2;
          // Skin coords: along the arm, around it, and which arm.
          armSkin[k * 4] = (i / SEG) * 0.45 + a * 3.1;
          armSkin[k * 4 + 1] = Math.cos(th) * 0.02;
          armSkin[k * 4 + 2] = Math.sin(th) * 0.02 + a * 1.7;
          // Frame "N" is set to point down in sit pose, so cos(th) > 0.5 = underside.
          armSkin[k * 4 + 3] = THREE.MathUtils.smoothstep(Math.cos(th), 0.3, 0.8);
        }
      }
      const tip = base + (SEG + 1) * RAD;
      armSkin[tip * 4] = 0.45 + a * 3.1;
      for (let i = 0; i < SEG; i++) {
        for (let j = 0; j < RAD; j++) {
          const p0 = base + i * RAD + j, p1 = base + i * RAD + ((j + 1) % RAD);
          idx.push(p0, p1, p0 + RAD, p1, p1 + RAD, p0 + RAD);
        }
      }
      for (let j = 0; j < RAD; j++) idx.push(base + SEG * RAD + j, base + SEG * RAD + ((j + 1) % RAD), tip);
    }
    const armGeo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.armPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(this.armNrm, 3).setUsage(THREE.DynamicDrawUsage);
    armGeo.setAttribute('position', this.posAttr);
    armGeo.setAttribute('normal', this.nrmAttr);
    armGeo.setAttribute('aSkin', new THREE.BufferAttribute(armSkin, 4));
    armGeo.setIndex(idx);
    this.armGeo = armGeo;
    this.armMesh = new THREE.Mesh(armGeo, mat);
    this.armMesh.castShadow = true;
    this.armMesh.receiveShadow = true;
    this.armMesh.frustumCulled = false;
    this.pivot.add(this.armMesh);

    this.jet = 0; // 0 spread .. 1 trailing
    this.crawl = 0;
    this.time = rng.float(0, 100);
    this._pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.updateArms(0);
  }

  /** Recompute arm geometry for the current pose blend. */
  updateArms(dt) {
    this.time += dt;
    const t = this.time;
    const S = this.size;
    const pts = this._pts;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
    const spread = new THREE.Vector3(), trail = new THREE.Vector3();
    const vertsPerArm = (SEG + 1) * RAD + 1;
    this.arms.forEach((arm, a) => {
      const L = arm.length;
      for (let i = 0; i <= SEG; i++) {
        const s = i / SEG;
        // --- Spread / crawl pose: lying radially on the reef, tips curling up.
        const gait = this.crawl * Math.max(0, Math.sin(t * 2.2 + a * (Math.PI / 2)));
        const rho = 0.035 * S + L * s * (1 - 0.18 * s) * (0.85 + 0.15 * Math.sin(t * 0.3 + arm.phase)) * (1 - 0.25 * gait);
        const hook = arm.curl * (0.35 * s * s + 1.4 * Math.max(0, s - 0.65) ** 2 * (1 + 0.6 * Math.sin(t * 0.8 + arm.phase)));
        const ang = arm.angle + hook * 0.9 + 0.08 * Math.sin(t * 0.5 + arm.phase) * s;
        const lift = (0.25 * L * THREE.MathUtils.smoothstep(s, 0.55, 1) * (0.5 + 0.5 * Math.sin(t * 1.1 + arm.phase * 2)) + gait * 0.12 * L * Math.sin(s * Math.PI));
        const r = 0.03 * S * Math.pow(1 - s, 1.6) + 0.002 * S;
        const y = Math.max(r * 0.9, 0.05 * S * (1 - s) ** 3) + lift;
        spread.set(Math.cos(ang) * rho, y, Math.sin(ang) * rho);
        // --- Jet pose: bundled behind the head (toward +x), pulsing open/closed.
        const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
        const open = (0.015 + 0.07 * s * pulse) * S;
        const wave = Math.sin(t * 6 - s * 8 + arm.phase) * 0.02 * S * s;
        trail.set(0.03 * S + L * s * 1.05, 0.05 * S + Math.sin(arm.angle) * open + wave, Math.cos(arm.angle) * open);
        pts[i].lerpVectors(spread, trail, this.jet);
      }
      // Tube with parallel-transport frames; initial normal points down so the
      // underside (suckers) stays on the reef side.
      const base = a * vertsPerArm;
      for (let i = 0; i <= SEG; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(SEG, i + 1)];
        const Ti = tmp.subVectors(p1, p0).normalize();
        if (i === 0) {
          N.set(0, -1, 0).addScaledVector(Ti, Ti.y).normalize();
          if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
        } else {
          const axis = new THREE.Vector3().crossVectors(T, Ti);
          const l = axis.length();
          if (l > 1e-6) N.applyAxisAngle(axis.divideScalar(l), Math.asin(Math.min(1, l)));
        }
        T.copy(Ti);
        B.crossVectors(T, N).normalize();
        const s = i / SEG;
        const r = 0.03 * S * Math.pow(1 - s, 1.6) + 0.002 * S;
        for (let j = 0; j < RAD; j++) {
          const th = (j / RAD) * Math.PI * 2;
          const cx = Math.cos(th), sx = Math.sin(th);
          const nx = N.x * cx + B.x * sx, ny = N.y * cx + B.y * sx, nz = N.z * cx + B.z * sx;
          const k = (base + i * RAD + j) * 3;
          this.armPos[k] = pts[i].x + nx * r;
          this.armPos[k + 1] = pts[i].y + ny * r;
          this.armPos[k + 2] = pts[i].z + nz * r;
          this.armNrm[k] = nx;
          this.armNrm[k + 1] = ny;
          this.armNrm[k + 2] = nz;
        }
      }
      const k = (base + (SEG + 1) * RAD) * 3;
      const last = pts[SEG];
      this.armPos[k] = last.x + T.x * 0.002 * S;
      this.armPos[k + 1] = last.y + T.y * 0.002 * S;
      this.armPos[k + 2] = last.z + T.z * 0.002 * S;
      this.armNrm[k] = T.x;
      this.armNrm[k + 1] = T.y;
      this.armNrm[k + 2] = T.z;
    });
    this.posAttr.needsUpdate = true;
    this.nrmAttr.needsUpdate = true;
    // Mantle breathing.
    const br = 1 + 0.06 * Math.sin(t * 1.6);
    this.body.scale.set(1, br, br);
  }
}

// ---------------------------------------------------------------------------

/**
 * An octopus living on the reef: sits camouflaged, flashes its display now and
 * then, creeps to a nearby spot, or occasionally jets further away.
 */
export class OctopusAgent {
  constructor({ groundFn, normalFn, pickSpot, rng, start, size = 1, seed = 1, camo }) {
    this.o = new Octopus({ size, seed, camo });
    this.group = this.o.group;
    this.groundFn = groundFn;
    this.normalFn = normalFn;
    this.pickSpot = pickSpot;
    this.rng = rng;
    this.pos = start.clone();
    this.heading = rng() * Math.PI * 2;
    this.state = 'sit';
    this.timer = 4 + rng() * 10;
    this.target = null;
    this.display = 0;
    this.flash = 0;
    this.height = 0;
    this._n = new THREE.Vector3();
  }

  _go() {
    const r = this.rng();
    const far = r < 0.3;
    for (let k = 0; k < 20; k++) {
      const p = this.pickSpot(this.rng, this.pos, far ? 7 : 3);
      if (p) {
        this.target = p;
        this.state = far ? 'jet' : 'crawl';
        return;
      }
    }
    this.timer = 5;
  }

  update(dt, time, active = true) {
    dt = Math.min(dt, 0.05);
    const o = this.o;
    this.timer -= dt;
    let jetGoal = 0, crawlGoal = 0, speed = 0, lift = 0;
    if (this.state === 'sit') {
      if (this.timer <= 0) this._go();
      // Occasional colour flash while sitting.
      if (this.rng() < dt * 0.05) this.flash = 3 + this.rng() * 3;
    } else {
      const to = new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
      const d = to.length();
      if (d < 0.15) {
        this.state = 'sit';
        this.timer = 10 + this.rng() * 20;
      } else {
        const want = Math.atan2(to.z, to.x);
        let dh = want - this.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading += dh * Math.min(1, dt * (this.state === 'jet' ? 3 : 1.2));
        if (this.state === 'jet') {
          jetGoal = 1;
          speed = Math.min(0.9, d * 0.8 + 0.2);
          lift = 0.45 * Math.min(1, d / 1.5);
        } else {
          crawlGoal = 1;
          speed = 0.12;
        }
        this.pos.x += Math.cos(this.heading) * speed * dt;
        this.pos.z += Math.sin(this.heading) * speed * dt;
      }
    }
    this.flash = Math.max(0, this.flash - dt);
    const wantDisplay = this.state === 'jet' ? 0.8 : this.flash > 0 ? 1 : 0;
    this.display += (wantDisplay - this.display) * Math.min(1, dt * 1.5);
    o.uniforms.uDisplay.value = this.display;
    o.jet += (jetGoal - o.jet) * Math.min(1, dt * 2.5);
    o.crawl += (crawlGoal - o.crawl) * Math.min(1, dt * 2);
    this.height += (lift - this.height) * Math.min(1, dt * 1.5);

    const g = this.groundFn(this.pos.x, this.pos.z);
    this.pos.y = g + this.height;
    this.group.position.copy(this.pos);
    // Sit flush with the local slope; while jetting, fly mantle-first
    // (the arms trail toward +x in the rig, so face the rig backward).
    this.normalFn(this.pos.x, this.pos.z, this._n);
    const up = new THREE.Vector3(0, 1, 0).lerp(this._n, 0.7 * (1 - o.jet)).normalize();
    const qTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const yaw = -this.heading + (o.jet > 0.5 ? Math.PI : 0);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.group.quaternion.copy(qTilt.multiply(qYaw));
    o.pivot.rotation.z = 0.5 * o.jet; // pitch the mantle forward into the jet
    if (active) o.updateArms(dt);
  }
}
