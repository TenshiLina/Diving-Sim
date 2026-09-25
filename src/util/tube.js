// Tapered tube builder with parallel-transport frames, used for coral
// branches, anemone tentacles and sea-fan twigs. Accumulates many tubes into a
// single set of arrays so an entire colony becomes one draw call.

import * as THREE from 'three';

export class TubeBatch {
  constructor(extraAttribs = {}) {
    this.pos = [];
    this.nrm = [];
    this.idx = [];
    this.col = [];
    // name -> itemSize
    this.extra = {};
    for (const [k, size] of Object.entries(extraAttribs)) this.extra[k] = { size, data: [] };
  }

  /**
   * @param {THREE.Vector3[]} pts   centreline points
   * @param {number[]} radii        radius per point
   * @param {object} o
   *   radial: segments around, cap: 'round' | 'flat' | null (end cap)
   *   color(i, t) -> [r,g,b], attr(name, i, t) -> value|array
   */
  add(pts, radii, o = {}) {
    const radial = o.radial ?? 6;
    const n = pts.length;
    const base = this.pos.length / 3;
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      T.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
    // Initial normal
    let N = new THREE.Vector3(0, 1, 0);
    if (Math.abs(T[0].y) > 0.9) N.set(1, 0, 0);
    N = new THREE.Vector3().crossVectors(T[0], N).normalize();
    const frames = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
        const len = axis.length();
        if (len > 1e-6) {
          axis.divideScalar(len);
          const ang = Math.acos(Math.min(1, Math.max(-1, T[i - 1].dot(T[i]))));
          N.applyAxisAngle(axis, ang);
        }
      }
      const B = new THREE.Vector3().crossVectors(T[i], N).normalize();
      frames.push([N.clone(), B]);
    }
    const tmp = new THREE.Vector3();
    const pushV = (p, nn, i, t) => {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      if (o.color) this.col.push(...o.color(i, t));
      for (const [k, a] of Object.entries(this.extra)) {
        const v = o.attr ? o.attr(k, i, t) : 0;
        if (a.size === 1) a.data.push(v);
        else a.data.push(...v);
      }
    };
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const [Ni, Bi] = frames[i];
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        tmp.copy(Ni).multiplyScalar(Math.cos(th)).addScaledVector(Bi, Math.sin(th));
        const p = pts[i].clone().addScaledVector(tmp, radii[i]);
        pushV(p, tmp, i, t);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j;
        const b = base + i * radial + ((j + 1) % radial);
        const c = a + radial;
        const d = b + radial;
        this.idx.push(a, b, c, b, d, c);
      }
    }
    // End cap
    if (o.cap) {
      const last = n - 1;
      const [Nl, Bl] = frames[last];
      const Tl = T[last];
      const r = radii[last];
      let ringStart = base + last * radial;
      if (o.cap === 'round') {
        const rings = 2;
        for (let k = 1; k <= rings; k++) {
          const phi = (k / (rings + 1)) * Math.PI * 0.5;
          const rr = r * Math.cos(phi);
          const off = r * Math.sin(phi);
          const start = this.pos.length / 3;
          for (let j = 0; j < radial; j++) {
            const th = (j / radial) * Math.PI * 2;
            tmp.copy(Nl).multiplyScalar(Math.cos(th)).addScaledVector(Bl, Math.sin(th));
            const nn = tmp.clone().multiplyScalar(Math.cos(phi)).addScaledVector(Tl, Math.sin(phi));
            const p = pts[last].clone().addScaledVector(tmp, rr).addScaledVector(Tl, off);
            pushV(p, nn, last, 1);
          }
          for (let j = 0; j < radial; j++) {
            const a = ringStart + j, b = ringStart + ((j + 1) % radial);
            const c = start + j, d = start + ((j + 1) % radial);
            this.idx.push(a, b, c, b, d, c);
          }
          ringStart = start;
        }
      }
      const tip = this.pos.length / 3;
      pushV(pts[last].clone().addScaledVector(Tl, o.cap === 'round' ? r : 0), Tl.clone(), last, 1);
      for (let j = 0; j < radial; j++) {
        this.idx.push(ringStart + j, ringStart + ((j + 1) % radial), tip);
      }
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const [k, a] of Object.entries(this.extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(a.data, a.size));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
