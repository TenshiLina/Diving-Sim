// Parametric reef-fish generator.
//
// A species is described in a normalised side-view space: the body runs from
// the nose at x = +0.5 to the caudal peduncle at x = -0.5 (body length = 1),
// y is up. Profiles give the top/bottom outline and half-width, fins are
// described by their base and an outline, and two painter callbacks draw the
// colour pattern in the same side-view coordinates. Because textures are
// projected side-on, a painter literally paints "a picture of the fish",
// which keeps species authoring quick.
//
// The result is a set of geometries + materials ready to be instanced, with a
// GPU swim cycle (travelling body wave + pectoral fin rowing).

import * as THREE from 'three';
import { monotone, smoothPath2 } from '../../util/curves.js';
import { underwater } from '../../water/underwater.js';

const TEX_W = 1024;

export function buildFishSpecies(spec) {
  const top = monotone(spec.top);
  const bottom = monotone(spec.bottom);
  const width = monotone(spec.width);
  const mid = (x) => 0.5 * (top(x) + bottom(x));

  // --- Fin curves -----------------------------------------------------------
  const fins = [];
  const addFin = (kind, def) => {
    const outline = smoothPath2(def.outline);
    let base;
    if (kind === 'dorsal') {
      const [a, b] = def.base;
      base = (s) => {
        const x = a + (b - a) * s;
        return [x, top(x) - (def.inset ?? 0.012)];
      };
    } else if (kind === 'anal') {
      const [a, b] = def.base;
      base = (s) => {
        const x = a + (b - a) * s;
        return [x, bottom(x) + (def.inset ?? 0.012)];
      };
    } else if (kind === 'caudal') {
      const x0 = -0.5 + (def.inset ?? 0.03);
      base = (s) => [x0, bottom(x0) * 0.85 + (top(x0) * 0.85 - bottom(x0) * 0.85) * s];
    } else {
      base = smoothPath2(def.base);
    }
    fins.push({ kind, def, base, outline });
  };
  for (const d of [].concat(spec.dorsal || [])) addFin('dorsal', d);
  for (const d of [].concat(spec.anal || [])) addFin('anal', d);
  if (spec.caudal) addFin('caudal', spec.caudal);
  if (spec.pectoral) addFin('pectoral', spec.pectoral);
  if (spec.pelvic) addFin('pelvic', spec.pelvic);

  // --- Texture-space bounds -------------------------------------------------
  let xmin = -0.5, xmax = 0.5, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const x = -0.5 + i / 100;
    ymin = Math.min(ymin, bottom(x));
    ymax = Math.max(ymax, top(x));
  }
  for (const f of fins) {
    for (let i = 0; i <= 50; i++) {
      for (const p of [f.outline(i / 50), f.base(i / 50)]) {
        xmin = Math.min(xmin, p[0]);
        xmax = Math.max(xmax, p[0]);
        ymin = Math.min(ymin, p[1]);
        ymax = Math.max(ymax, p[1]);
      }
    }
  }
  const pad = 0.02;
  xmin -= pad; xmax += pad; ymin -= pad; ymax += pad;
  const bounds = { xmin, xmax, ymin, ymax };
  const TEX_H = Math.min(1024, Math.pow(2, Math.round(Math.log2((TEX_W * (ymax - ymin)) / (xmax - xmin)))));
  const uvOf = (x, y) => [(x - xmin) / (xmax - xmin), (y - ymin) / (ymax - ymin)];

  // --- Body -----------------------------------------------------------------
  const NX = 56;
  const NT = 36;
  const pos = [];
  const uv = [];
  const idx = [];
  const p = spec.sectionPower ?? 0.85;
  const xs = [];
  for (let i = 0; i < NX; i++) {
    // Denser near the nose where curvature is high.
    const s = (i + 1) / NX;
    xs.push(0.5 - Math.pow(s, 1.35) * 1.0);
  }
  // Nose tip vertex
  const noseY = mid(0.5);
  pos.push(0.5 + 0.004, noseY, 0);
  uv.push(...uvOf(0.5, noseY));
  for (let i = 0; i < NX; i++) {
    const x = xs[i];
    const yc = mid(x);
    const yh = 0.5 * (top(x) - bottom(x));
    const w = width(x);
    for (let j = 0; j < NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const y = yc + yh * sn;
      const z = w * Math.sign(c) * Math.pow(Math.abs(c), p);
      pos.push(x, y, z);
      uv.push(...uvOf(x, y));
    }
  }
  // Tail cap vertex
  const tailX = xs[NX - 1] - 0.004;
  pos.push(tailX, mid(xs[NX - 1]), 0);
  uv.push(...uvOf(tailX, mid(xs[NX - 1])));
  const ring = (i, j) => 1 + i * NT + ((j + NT) % NT);
  for (let j = 0; j < NT; j++) idx.push(0, ring(0, j + 1), ring(0, j));
  for (let i = 0; i < NX - 1; i++) {
    for (let j = 0; j < NT; j++) {
      const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const tailIdx = pos.length / 3 - 1;
  for (let j = 0; j < NT; j++) idx.push(tailIdx, ring(NX - 1, j), ring(NX - 1, j + 1));

  // Eyes: small spheres sunk into the head; uv points at the eye image that the
  // painter draws at the eye location (so they share the body texture).
  const eye = spec.eye;
  const eyeSurfaceZ = (() => {
    const yc = mid(eye.x);
    const yh = 0.5 * (top(eye.x) - bottom(eye.x));
    const sn = Math.max(-1, Math.min(1, (eye.y - yc) / yh));
    const c = Math.sqrt(1 - sn * sn);
    return width(eye.x) * Math.pow(c, p);
  })();
  for (const side of [1, -1]) {
    const sph = new THREE.SphereGeometry(eye.r, 18, 12);
    sph.rotateX(side > 0 ? Math.PI / 2 : -Math.PI / 2); // pole -> +/- z
    const off = pos.length / 3;
    const sp = sph.attributes.position;
    for (let k = 0; k < sp.count; k++) {
      const lx = sp.getX(k), ly = sp.getY(k), lz = sp.getZ(k);
      const X = eye.x + lx, Y = eye.y + ly, Z = side * (eyeSurfaceZ - eye.r * 0.45) + lz;
      pos.push(X, Y, Z);
      uv.push(...uvOf(X, Y));
    }
    const si = sph.index.array;
    for (let k = 0; k < si.length; k++) idx.push(si[k] + off);
  }

  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();

  // --- Fins -----------------------------------------------------------------
  const fpos = [], fuv = [], fidx = [], ffin = [];
  const NS = 24, NR = 8;
  for (const f of fins) {
    const off = fpos.length / 3;
    const pect = f.kind === 'pectoral' || f.kind === 'pelvic';
    const sides = pect ? [1, -1] : [0];
    for (const side of sides) {
      const o2 = fpos.length / 3;
      for (let i = 0; i <= NS; i++) {
        const s = i / NS;
        const b = f.base(s);
        const o = f.outline(s);
        for (let j = 0; j <= NR; j++) {
          const r = j / NR;
          const x = b[0] + (o[0] - b[0]) * r;
          const y = b[1] + (o[1] - b[1]) * r;
          let z = 0;
          if (pect) {
            // Pectoral fins leave the body at the surface and angle outward.
            const zBody = width(b[0]) * 0.9;
            z = side * (zBody + r * (f.def.splay ?? 0.1));
          }
          fpos.push(x, y, z);
          fuv.push(...uvOf(x, y));
          // aFin: x = kind (0 median, 1 paired), y = side, z = distance from base (0..1)
          ffin.push(pect ? 1 : 0, side, r);
        }
      }
      for (let i = 0; i < NS; i++) {
        for (let j = 0; j < NR; j++) {
          const a = o2 + i * (NR + 1) + j;
          const b = a + NR + 1;
          fidx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    void off;
  }
  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  finGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
  finGeo.setAttribute('aFin', new THREE.Float32BufferAttribute(ffin, 3));
  finGeo.setIndex(fidx);
  finGeo.computeVertexNormals();

  // --- Textures ---------------------------------------------------------------
  const api = { top, bottom, mid, width, fins, bounds, eye, finByKind: (k) => fins.filter((f) => f.kind === k) };
  const bodyCanvas = makeCanvas(TEX_W, TEX_H, bounds);
  spec.paintBody(bodyCanvas.ctx, api);
  paintEye(bodyCanvas.ctx, eye, spec.eyeColors);
  const finCanvas = makeCanvas(TEX_W, TEX_H, bounds);
  spec.paintFins(finCanvas.ctx, api);
  const bumpCanvas = makeCanvas(TEX_W, TEX_H, bounds);
  paintScalesBump(bumpCanvas.ctx, api, spec.scaleSize ?? 0.028);

  const bodyTex = canvasTexture(bodyCanvas.canvas, true);
  const finTex = canvasTexture(finCanvas.canvas, true);
  const bumpTex = canvasTexture(bumpCanvas.canvas, false);

  // --- Materials ------------------------------------------------------------
  const swimUniforms = {
    uSwimAmp: { value: spec.swim?.amp ?? 0.09 },
    uSwimK: { value: spec.swim?.waveK ?? 5.5 },
    uFinTime: { value: 0 },
  };
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: bodyTex,
    bumpMap: bumpTex,
    bumpScale: spec.bumpScale ?? 0.6,
    roughness: spec.roughness ?? 0.42,
    metalness: 0,
    clearcoat: spec.clearcoat ?? 0.35,
    clearcoatRoughness: 0.35,
    iridescence: spec.iridescence ?? 0,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [200, 500],
    sheen: spec.sheen ?? 0,
    sheenColor: new THREE.Color(spec.sheenColor ?? 0xffffff),
  });
  const finMat = new THREE.MeshStandardMaterial({
    map: finTex,
    roughness: 0.55,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: true,
  });
  for (const m of [bodyMat, finMat]) {
    underwater(m);
    addSwim(m, swimUniforms);
  }

  const scale = spec.length;
  return { spec, body, fins: finGeo, bodyMat, finMat, swimUniforms, scale, bounds, api };
}

// ---------------------------------------------------------------------------

function makeCanvas(w, h, b) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const sx = w / (b.xmax - b.xmin);
  const sy = h / (b.ymax - b.ymin);
  ctx.setTransform(sx, 0, 0, -sy, -b.xmin * sx, b.ymax * sy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { canvas, ctx };
}

function canvasTexture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function paintEye(ctx, eye, colors = {}) {
  const r = eye.r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, r * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = colors.ring ?? '#1a1208';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, r * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = colors.iris ?? '#c89a2c';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#050505';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye.x + r * 0.18, eye.y + r * 0.2, r * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  ctx.restore();
}

// Overlapping scale arcs as a bump map; fades toward the head.
function paintScalesBump(ctx, api, size) {
  const { bounds } = api;
  ctx.save();
  ctx.fillStyle = '#808080';
  ctx.fillRect(bounds.xmin, bounds.ymin, bounds.xmax - bounds.xmin, bounds.ymax - bounds.ymin);
  ctx.lineWidth = size * 0.16;
  const rows = Math.ceil((bounds.ymax - bounds.ymin) / (size * 0.55));
  for (let r = 0; r <= rows; r++) {
    const y = bounds.ymin + r * size * 0.55;
    const shift = (r % 2) * size * 0.5;
    for (let x = -0.5 + shift; x < 0.3; x += size) {
      const fade = Math.min(1, (0.3 - x) / 0.15);
      ctx.strokeStyle = `rgba(40,40,40,${0.55 * fade})`;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.55, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(200,200,200,${0.35 * fade})`;
      ctx.beginPath();
      ctx.arc(x - size * 0.08, y, size * 0.5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// GPU swim cycle shared by body and fin materials.
// Per-instance attribute aSwim = (phase, amplitude scale, turn bend).
function addSwim(material, swimUniforms) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, swimUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uSwimAmp;
        uniform float uSwimK;
        uniform float uFinTime;
        #ifdef USE_INSTANCING
        attribute vec3 aSwim;
        #else
        const vec3 aSwim = vec3(0.0, 1.0, 0.0);
        #endif
        #ifdef FISH_FINS
        attribute vec3 aFin;
        #endif
        float swimS(float x) { return clamp(0.5 - x, 0.0, 1.6); }
        float swimEnv(float s) { return 0.12 + 0.88 * s * s; }
        float swimOffset(float x) {
          float s = swimS(x);
          return uSwimAmp * aSwim.y * swimEnv(s) * sin(s * uSwimK - aSwim.x) + aSwim.z * s * s;
        }
        float swimSlope(float x) {
          float s = swimS(x);
          float A = uSwimAmp * aSwim.y;
          // d/dx = -d/ds
          return -(A * (1.76 * s) * sin(s * uSwimK - aSwim.x) + A * swimEnv(s) * uSwimK * cos(s * uSwimK - aSwim.x) + 2.0 * aSwim.z * s);
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `#include <beginnormal_vertex>
        {
          float g = swimSlope(position.x);
          objectNormal = normalize(vec3(objectNormal.x - g * objectNormal.z, objectNormal.y, objectNormal.z));
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef FISH_FINS
        if (aFin.x > 0.5) {
          // Paired fins row back and forth about their base.
          float ang = aFin.y * (0.45 + 0.35 * sin(uFinTime * 7.0 + aSwim.x * 0.7)) * aFin.z;
          vec3 base = vec3(transformed.x, transformed.y, transformed.z);
          transformed.z += aFin.y * sin(abs(ang)) * 0.06 * aFin.z;
          transformed.x -= abs(sin(ang)) * 0.05 * aFin.z;
        } else {
          // Median fins ripple slightly toward their edges.
          transformed.z += 0.012 * aFin.z * sin(transformed.x * 30.0 + uFinTime * 6.0 + aSwim.x);
        }
        #endif
        transformed.z += swimOffset(position.x);`,
      );
  };
  if (material.side === THREE.DoubleSide) material.defines.FISH_FINS = '';
}
