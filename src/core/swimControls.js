// First-person diver controls.
//
// Desktop: drag to look, WASD / arrow keys to swim, Space/E up, Q/C down,
// Shift to kick harder, wheel for a quick push forward.
// Touch: drag anywhere to look, the left joystick swims, ▲ ▼ buttons rise and
// sink.
// Idle: after a while with no input the diver drifts along a tour path.

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

export class SwimControls {
  constructor(camera, dom, { overlay, speed = 1.3, tour = null, idleSeconds = 12, startTour = true } = {}) {
    this.isSwim = true;
    this.camera = camera;
    this.dom = dom;
    this.speed = speed;
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.lift = 0;
    this.tour = tour; // THREE.Curve (closed)
    this.tourT = 0;
    this.touring = Boolean(tour && startTour);
    this.idle = 0;
    this.idleSeconds = idleSeconds;
    this.bob = 0;
    this.enabled = true;
    this._listeners = [];
    this._bind(overlay);
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  _touch() {
    this.idle = 0;
    if (this.touring) {
      this.touring = false;
      this.onTourChange?.(false);
    }
  }

  _bind(overlay) {
    const dom = this.dom;
    let look = null;
    this._on(dom, 'pointerdown', (e) => {
      if (look) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dom.setPointerCapture?.(e.pointerId);
      this._touch();
    });
    this._on(dom, 'pointermove', (e) => {
      if (!look || e.pointerId !== look.id) return;
      const k = e.pointerType === 'touch' ? 0.006 : 0.0035;
      this.yaw -= (e.clientX - look.x) * k;
      this.pitch -= (e.clientY - look.y) * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35);
      look.x = e.clientX;
      look.y = e.clientY;
    });
    const endLook = (e) => {
      if (look && e.pointerId === look.id) look = null;
    };
    this._on(dom, 'pointerup', endLook);
    this._on(dom, 'pointercancel', endLook);
    this._on(dom, 'wheel', (e) => {
      e.preventDefault();
      this._touch();
      this._forward(_f);
      this.vel.addScaledVector(_f, -Math.sign(e.deltaY) * 0.8);
    }, { passive: false });
    this._on(window, 'keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      if (/Arrow|Space/.test(e.code)) e.preventDefault();
      this._touch();
    });
    this._on(window, 'keyup', (e) => this.keys.delete(e.code));
    this._on(window, 'blur', () => this.keys.clear());

    if (overlay) this._buildTouchUI(overlay);
  }

  _buildTouchUI(overlay) {
    const ui = document.createElement('div');
    ui.className = 'swim-ui';
    ui.innerHTML = `
      <div class="joy" aria-label="Swim joystick"><div class="knob"></div></div>
      <div class="lift">
        <button type="button" class="up" aria-label="Rise">▲</button>
        <button type="button" class="down" aria-label="Sink">▼</button>
      </div>`;
    overlay.appendChild(ui);
    this.ui = ui;
    const joy = ui.querySelector('.joy');
    const knob = ui.querySelector('.knob');
    let jid = null;
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.joy.x = x;
      this.joy.y = y;
      knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
    };
    this._on(joy, 'pointerdown', (e) => {
      e.stopPropagation();
      jid = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      setJoy(e);
      this._touch();
    });
    this._on(joy, 'pointermove', (e) => e.pointerId === jid && setJoy(e));
    const endJoy = (e) => {
      if (e.pointerId !== jid) return;
      jid = null;
      this.joy.x = this.joy.y = 0;
      knob.style.transform = '';
    };
    this._on(joy, 'pointerup', endJoy);
    this._on(joy, 'pointercancel', endJoy);
    for (const [cls, dir] of [['.up', 1], ['.down', -1]]) {
      const b = ui.querySelector(cls);
      this._on(b, 'pointerdown', (e) => {
        e.stopPropagation();
        this.lift = dir;
        this._touch();
      });
      const stop = () => (this.lift = 0);
      this._on(b, 'pointerup', stop);
      this._on(b, 'pointerleave', stop);
      this._on(b, 'pointercancel', stop);
    }
  }

  _forward(out) {
    return out.set(Math.cos(this.pitch) * -Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch) * -Math.cos(this.yaw));
  }

  /** Place the diver at `pos` looking at `target`. */
  setPose(pos, target) {
    this.camera.position.copy(pos);
    _v.subVectors(target, pos).normalize();
    this.yaw = Math.atan2(-_v.x, -_v.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1));
    this._apply(0);
  }

  /** A point a few metres ahead: where shadows should be sharpest. */
  focus(out = new THREE.Vector3()) {
    return out.copy(this.camera.position).addScaledVector(this._forward(_f), 6);
  }

  setTour(curve, start = true) {
    this.tour = curve;
    this.touring = Boolean(curve && start);
    this.onTourChange?.(this.touring);
  }

  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.1);
    const k = this.keys;
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    let side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    let up = (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') ? 1 : 0) + this.lift;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.2 : 1;
    const active = fwd || side || up;
    if (active) this._touch();
    else this.idle += dt;
    if (!this.touring && this.tour && this.idle > this.idleSeconds) {
      this.touring = true;
      // Join the tour at the nearest point.
      let best = 0, bd = Infinity;
      for (let i = 0; i < 200; i++) {
        const d = this.tour.getPointAt(i / 200).distanceToSquared(this.camera.position);
        if (d < bd) { bd = d; best = i / 200; }
      }
      this.tourT = best;
      this.onTourChange?.(true);
    }

    if (this.touring) {
      const len = this.tour.getLength();
      this.tourT = (this.tourT + (dt * 0.75) / len) % 1;
      const target = this.tour.getPointAt(this.tourT);
      const ahead = this.tour.getPointAt((this.tourT + 5 / len) % 1);
      // Ease toward the path and look along it.
      _v.subVectors(target, this.camera.position);
      this.vel.lerp(_v.multiplyScalar(0.8), Math.min(1, dt * 1.5));
      _v.subVectors(ahead, this.camera.position).normalize();
      const ty = Math.atan2(-_v.x, -_v.z);
      const tp = Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1)) - 0.12;
      let dy = ty - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 0.8);
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 0.8);
    } else {
      this._forward(_f);
      _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const acc = this.speed * 2.2 * boost;
      this.vel.addScaledVector(_f, fwd * acc * dt).addScaledVector(_r, side * acc * dt);
      this.vel.y += up * acc * 0.8 * dt;
      // Water drag.
      this.vel.multiplyScalar(Math.exp(-dt * 1.6));
    }
    this.camera.position.addScaledVector(this.vel, dt);
    this._apply(dt);
  }

  _apply(dt) {
    // Gentle breathing bob and roll, like hanging in the water column.
    this.bob += dt;
    const bobY = Math.sin(this.bob * 0.9) * 0.012;
    const roll = Math.sin(this.bob * 0.37) * 0.012;
    this.camera.position.y += bobY * dt * 4;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, roll, 'YXZ'));
  }

  dispose() {
    for (const off of this._listeners) off();
    this.ui?.remove();
  }
}
