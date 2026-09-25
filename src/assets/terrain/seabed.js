// Coral-sand seabed: gentle dunes in geometry, fine wave ripples and grains in
// tileable procedurally-generated colour + normal textures.

import * as THREE from 'three';
import { SimplexNoise, mulberry32 } from '../../util/noise.js';
import { underwater } from '../../water/underwater.js';

export function makeSeabedHeight(seed = 2) {
  const n = new SimplexNoise(seed);
  return (x, z) => {
    let h = 0.35 * n.fbm3(x * 0.06, 0, z * 0.06, 4);
    h += 0.08 * n.noise3(x * 0.25, 1.7, z * 0.25);
    // Bowl: the "aquarium" floor rises gently toward the edges so the world
    // closes off softly in the haze.
    const r = Math.hypot(x, z);
    h += Math.min(1.5, Math.max(0, r - 16) * 0.08);
    return h;
  };
}

// Tileable value noise on a W x W periodic grid.
function periodicNoise(size, period, rand) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const fx = (x / size) * period, fy = (y / size) * period;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => g[((j % period + period) % period) * period + ((i % period + period) % period)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function makeSandTextures(size = 512, seed = 5) {
  const rand = mulberry32(seed);
  const n1 = periodicNoise(size, 8, rand);
  const n2 = periodicNoise(size, 32, rand);
  const n3 = periodicNoise(size, 128, rand);
  const H = new Float32Array(size * size);
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d');
  const cimg = cctx.createImageData(size, size);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // Ripples: integer frequencies keep them tileable; warped by periodic noise.
      const warp = n1(x, y) * 2.2 + n2(x, y) * 0.6;
      const ph = TAU * (5 * u + 2 * v) + warp * 2.5;
      const rip = Math.pow(0.5 + 0.5 * Math.sin(ph), 1.6);
      const grain = n3(x, y);
      H[y * size + x] = rip * 1.0 + grain * 0.18 + n2(x, y) * 0.25;
      // Colour: pale coral sand with darker troughs, specks of shell and detritus.
      let r = 0.86, g = 0.8, b = 0.66;
      const shade = 0.82 + 0.18 * rip + (n2(x, y) - 0.5) * 0.12;
      r *= shade; g *= shade; b *= shade;
      const sp = rand();
      if (sp > 0.985) { r *= 1.12; g *= 1.1; b *= 1.08; }
      else if (sp < 0.004) { r *= 0.7; g *= 0.68; b *= 0.65; }
      else if (sp < 0.007) { r = 0.85; g = 0.62; b = 0.6; }
      const k = (y * size + x) * 4;
      cimg.data[k] = Math.min(255, r * 255);
      cimg.data[k + 1] = Math.min(255, g * 255);
      cimg.data[k + 2] = Math.min(255, b * 255);
      cimg.data[k + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);

  const nCanvas = document.createElement('canvas');
  nCanvas.width = nCanvas.height = size;
  const nctx = nCanvas.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      nimg.data[k] = ((-dx / l) * 0.5 + 0.5) * 255;
      nimg.data[k + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nimg.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nimg.data[k + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nCanvas);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, normalMap };
}

export function createSeabed({ size = 180, segments = 360, heightFn = makeSeabedHeight(), tile = 3.2 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightFn(x, z));
    uv.setXY(i, x / tile, z / tile);
  }
  geo.computeVertexNormals();
  const { map, normalMap } = makeSandTextures();
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.95,
    metalness: 0,
  });
  underwater(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'seabed';
  return mesh;
}
