// Great Barrier Reef dive site: a procedural fringing reef populated from the
// asset catalogue. Corals are scattered by zone and instanced in chunks;
// fish, rays and clams live where they would on a real reef.

import * as THREE from 'three';
import { createReefField, createReefTerrainMesh } from '../assets/terrain/reefTerrain.js';
import { createBrainCoral } from '../assets/coral/brainCoral.js';
import { createStaghorn } from '../assets/coral/staghorn.js';
import { createTableCoral } from '../assets/coral/tableCoral.js';
import { createAnemone } from '../assets/coral/anemone.js';
import { createSeaFan } from '../assets/coral/seaFan.js';
import { createSeagrass } from '../assets/plants/seagrass.js';
import { createRock } from '../assets/terrain/rocks.js';
import { createGiantClam } from '../assets/invertebrates/giantClam.js';
import { buildRay, RayGroup, RAY_SPECIES } from '../assets/rays/rays.js';
import { getFish } from '../assets/catalog.js';
import { FishSchool } from '../assets/fish/school.js';
import { instanceVariants } from '../util/instancing.js';
import { Rng, SimplexNoise } from '../util/noise.js';
import { water } from '../water/underwater.js';

// Coral types: footprint radius (metres at scale 1) and a list of variant
// factories. Each factory is called twice: full detail for nearby chunks and a
// light version (fewer segments / blades / tentacles) for distant ones.
function makeVariants() {
  const both = (radius, factories) => ({
    radius,
    variants: factories.map((f) => f(false)),
    far: factories.map((f) => f(true)),
  });
  const stag = (o) => (far) => createStaghorn({ depth: 3, ...o, radial: far ? 3 : 5, segLen: far ? 0.12 : 0.05, caps: far ? 'flat' : 'round' });
  const brain = (o) => (far) => createBrainCoral({ radius: 0.45, ...o, segments: far ? 0.2 : 0.4 });
  const table = (o) => (far) => createTableCoral({ ...o, rings: far ? 8 : 16, sectors: far ? 32 : 64 });
  const fan = (o) => (far) => createSeaFan({ ...o, density: far ? Math.round(o.density * 0.3) : o.density });
  const clam = (o) => (far) => createGiantClam({ ...o, segments: far ? 0.3 : 0.7 });
  const anem = (o) => (far) => createAnemone({ ...o, tentacles: far ? Math.round(o.tentacles * 0.3) : o.tentacles, radial: far ? 3 : 5, tentacleSegs: far ? 3 : 5 });
  const grass = (o) => (far) => createSeagrass({ ...o, blades: far ? Math.round(o.blades * 0.35) : o.blades });
  return {
    staghorn: both(0.45, [
      stag({ seed: 101, palette: 'tan' }),
      stag({ seed: 102, palette: 'blue', trunks: 7 }),
      stag({ seed: 103, palette: 'purple' }),
      stag({ seed: 104, palette: 'cream', trunks: 12 }),
      stag({ seed: 105, palette: 'tan', trunks: 7, depth: 4 }),
    ]),
    brain: both(0.45, [brain({ seed: 201 }), brain({ seed: 202, palette: 'green' }), brain({ seed: 203, palette: 'moss' })]),
    table: both(0.8, [
      table({ seed: 301, radius: 0.8, palette: 'sage', stalkHeight: 0.3 }),
      table({ seed: 302, radius: 0.7, palette: 'tan', stalkHeight: 0.25 }),
      table({ seed: 303, radius: 0.75, palette: 'teal', stalkHeight: 0.35 }),
    ]),
    fan: both(0.5, [
      fan({ seed: 401, height: 1.1, palette: 'orange', density: 320 }),
      fan({ seed: 402, height: 0.9, palette: 'purple', density: 280 }),
      fan({ seed: 403, height: 0.8, palette: 'red', density: 260 }),
      fan({ seed: 404, height: 0.7, palette: 'yellow', density: 240 }),
    ]),
    clam: both(0.45, [
      clam({ seed: 501, length: 0.75, palette: 'electric' }),
      clam({ seed: 502, length: 0.6, palette: 'emerald', folds: 4 }),
      clam({ seed: 503, length: 0.65, palette: 'violet' }),
      clam({ seed: 504, length: 0.9, palette: 'gold', folds: 6 }),
    ]),
    anemone: both(0.45, [
      anem({ seed: 601, radius: 0.34, tentacles: 380 }),
      anem({ seed: 602, radius: 0.28, palette: 'green', tentacles: 320 }),
      anem({ seed: 603, radius: 0.3, palette: 'pink', tentacles: 340 }),
    ]),
    seagrass: both(0.35, [
      grass({ seed: 701, blades: 45, spread: 0.4, height: 0.5 }),
      grass({ seed: 702, blades: 35, spread: 0.35, height: 0.35, palette: 'emerald' }),
      grass({ seed: 703, blades: 55, spread: 0.45, height: 0.6 }),
    ]),
    rock: { radius: 0.5, variants: [1, 2, 3, 4].map((s) => createRock({ seed: 800 + s, radius: 0.5, flatten: 0.6 })) },
  };
}

// Relative likelihood of each coral type per zone.
const ZONE_WEIGHTS = {
  flat: { staghorn: 0.46, table: 0.16, brain: 0.16, clam: 0.07, anemone: 0.012, fan: 0.02, rock: 0.08 },
  slope: { staghorn: 0.32, table: 0.22, brain: 0.24, fan: 0.14, clam: 0.025, anemone: 0.01, rock: 0.04 },
  bommie: { brain: 0.3, staghorn: 0.26, fan: 0.2, table: 0.1, clam: 0.06, anemone: 0.03, rock: 0.03 },
};

function pickWeighted(weights, r) {
  let total = 0;
  for (const w of Object.values(weights)) total += w;
  let x = r * total;
  for (const [k, w] of Object.entries(weights)) {
    x -= w;
    if (x <= 0) return k;
  }
  return Object.keys(weights)[0];
}

export function buildGBR(app, { tour = true } = {}) {
  const rng = new Rng(2024);
  const noise = new SimplexNoise(99);
  const field = createReefField();
  const surfaceY = water.uSurfaceY.value;
  app.add(createReefTerrainMesh(field));
  app.groundFn = field.height;
  app.camera.far = 140;
  app.camera.updateProjectionMatrix();

  // --- Scatter ----------------------------------------------------------------
  const types = makeVariants();
  const placements = Object.fromEntries(Object.keys(types).map((k) => [k, []]));
  const placed = new Map(); // spatial hash: "ix:iz" -> [{x,z,r}]
  const cellKey = (x, z) => `${Math.floor(x)}:${Math.floor(z)}`;
  const free = (x, z, r) => {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const list = placed.get(cellKey(x + dx, z + dz));
        if (!list) continue;
        for (const q of list) if (Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.75) return false;
      }
    return true;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  const place = (type, x, z, { scale = 1, tilt = 0.35, yaw = rng.float(0, Math.PI * 2), sink = 0.04 } = {}) => {
    const t = types[type];
    const r = t.radius * scale;
    if (!free(x, z, r)) return null;
    const y = field.height(x, z) - sink * scale;
    field.normal(x, z, n);
    const q = new THREE.Quaternion().setFromUnitVectors(up, up.clone().lerp(n, tilt).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
    const variant = rng.int(0, t.variants.length - 1);
    placements[type].push({ variant, matrix: m, x, y, z, scale });
    const k = cellKey(x, z);
    if (!placed.has(k)) placed.set(k, []);
    placed.get(k).push({ x, z, r });
    return placements[type][placements[type].length - 1];
  };

  const X0 = -48, X1 = 52, Z0 = -48, Z1 = 48;
  const step = 0.7;
  for (let x = X0; x < X1; x += step) {
    for (let z = Z0; z < Z1; z += step) {
      const px = x + rng.float(-0.4, 0.4) * step;
      const pz = z + rng.float(-0.4, 0.4) * step;
      const h = field.height(px, pz);
      const reef = field.reef(px, pz);
      const t = field.zone(px, pz);
      const depth = surfaceY - h;
      if (depth < 0.9) continue; // keep clear of the surface
      const patch = 0.5 + 0.5 * noise.noise3(px * 0.08, 0.3, pz * 0.08);
      if (reef > 0.55) {
        const onBommie = t > 0.9;
        const zone = onBommie ? 'bommie' : t < 0.12 ? 'flat' : 'slope';
        const density = zone === 'bommie' ? 0.95 * reef : (zone === 'flat' ? 0.55 : 0.7) * (0.5 + 0.5 * patch) * reef;
        if (rng.next() > density) continue;
        const type = pickWeighted(ZONE_WEIGHTS[zone], rng.next());
        const scale =
          type === 'table' ? rng.float(0.6, 1.25) :
          type === 'clam' ? rng.float(0.7, 1.3) :
          type === 'fan' ? rng.float(0.7, 1.3) :
          rng.float(0.55, 1.35);
        const yaw = type === 'fan' ? Math.PI / 2 + rng.float(-0.35, 0.35) : undefined;
        place(type, px, pz, {
          scale,
          yaw,
          tilt: type === 'fan' || type === 'table' ? 0.1 : type === 'clam' ? 0.2 : 0.4,
          sink: type === 'clam' ? 0.04 : 0.04,
        });
      } else if (reef < 0.25) {
        // Sand: seagrass meadows in patches, the odd rock, a few clams.
        const meadow = noise.noise3(px * 0.06, 4.2, pz * 0.06);
        if (meadow > 0.35 && rng.next() < 0.45) place('seagrass', px, pz, { scale: rng.float(0.7, 1.3), tilt: 0, sink: 0 });
        else if (rng.next() < 0.006) place('rock', px, pz, { scale: rng.float(0.4, 1.1), tilt: 0.2 });
        else if (depth < 6 && rng.next() < 0.003) place('clam', px, pz, { scale: rng.float(0.7, 1.1), tilt: 0.1, sink: 0.1 });
      }
    }
  }
  for (const [type, list] of Object.entries(placements)) {
    if (!list.length) continue;
    const lod = app.quality === 'low' ? { near: 6, range: 32 } : {};
    const g = app.add(instanceVariants(types[type].variants, list, { far: types[type].far, name: type, ...lod }));
    app.onUpdate(() => g.userData.updateLOD(app.camera));
  }
  const counts = Object.fromEntries(Object.entries(placements).map(([k, v]) => [k, v.length]));

  // --- Fish -----------------------------------------------------------------
  const schools = [];
  const addSchool = (name, opts) => {
    const s = new FishSchool(getFish(name, { lite: name === 'chromis' }), { groundFn: field.height, maxY: surfaceY - 0.8, ...opts });
    app.add(s.group);
    const home = s.o.home;
    app.onUpdate((dt, t) => {
      s.update(dt, t);
      // Beyond the visibility range the school keeps living but isn't drawn.
      s.group.visible = Math.hypot(home.x - app.camera.position.x, home.z - app.camera.position.z) < 50;
    });
    schools.push(s);
  };
  // Clownfish families live in (some of) the anemones.
  placements.anemone.slice(0, 14).forEach((a, i) => {
    addSchool('clownfish', {
      count: rng.int(2, 3), home: new THREE.Vector3(a.x, a.y + 0.25 * a.scale, a.z), homeRadius: 0.4, homeStrength: 2.5,
      cruise: 0.08, speed: [0.03, 0.2], neighbor: 0.4, separation: 0.12, wander: 1.2, minHeight: 0.0,
      groundFn: () => a.y + 0.08, seed: 10 + i, maxPitch: 0.35,
    });
  });
  // Chromis clouds hover over staghorn thickets.
  const stags = [...placements.staghorn].sort(() => rng.next() - 0.5);
  const chromisHomes = [];
  for (const s of stags) {
    if (chromisHomes.length >= 12) break;
    if (chromisHomes.some((h) => h.distanceTo(new THREE.Vector3(s.x, s.y, s.z)) < 9)) continue;
    chromisHomes.push(new THREE.Vector3(s.x, s.y + 0.9, s.z));
  }
  chromisHomes.forEach((h, i) =>
    addSchool('chromis', {
      count: rng.int(16, 26), home: h, homeRadius: 1.1, homeStrength: 1.2, cruise: 0.14, speed: [0.05, 0.35],
      neighbor: 0.5, separation: 0.12, wAli: 0.9, wCoh: 0.6, wander: 0.5, minHeight: 0.7, seed: 30 + i,
    }),
  );
  // Blue tangs roam the slope; butterflyfish pairs pick along the reef.
  const reefPoint = (minT, maxT) => {
    for (let k = 0; k < 200; k++) {
      const x = rng.float(X0 + 5, X1 - 5), z = rng.float(Z0 + 5, Z1 - 5);
      const t = field.zone(x, z);
      if (field.reef(x, z) > 0.6 && t >= minT && t <= maxT) return new THREE.Vector3(x, field.height(x, z) + 1.5, z);
    }
    return new THREE.Vector3(0, field.height(0, 0) + 1.5, 0);
  };
  for (let i = 0; i < 6; i++) {
    addSchool('blueTang', {
      count: rng.int(3, 6), home: reefPoint(0.05, 0.8), homeRadius: 9, homeStrength: 0.5, cruise: 0.35, speed: [0.15, 0.6],
      neighbor: 1.5, separation: 0.5, wander: 0.8, minHeight: 0.9, seed: 50 + i,
    });
  }
  for (let i = 0; i < 10; i++) {
    addSchool('butterflyfish', {
      count: 2, home: reefPoint(0, 1), homeRadius: 4, homeStrength: 0.6, cruise: 0.22, speed: [0.08, 0.4],
      neighbor: 1.2, separation: 0.35, wAli: 1.2, wCoh: 1.0, wander: 0.7, minHeight: 0.8, seed: 70 + i,
    });
  }

  // --- Rays -----------------------------------------------------------------
  const sandPoint = (r) => {
    for (let k = 0; k < 60; k++) {
      const x = X0 + 8 + r() * (X1 - X0 - 16), z = Z0 + 8 + r() * (Z1 - Z0 - 16);
      if (field.reef(x, z) < 0.15 && field.zone(x, z) > 0.2) return new THREE.Vector3(x, 0, z);
    }
    return null;
  };
  const rayRng = new Rng(77);
  const ribbontails = new RayGroup(buildRay(RAY_SPECIES.ribbontail), {
    count: 6, mode: 'bottom', speed: 0.3, height: 0.25, groundFn: field.height, pickTarget: sandPoint, rng: () => rayRng.next(),
  });
  const eagles = new RayGroup(buildRay(RAY_SPECIES.eagleRay), {
    count: 3, mode: 'cruise', speed: 0.55, height: 4.5, maxY: surfaceY - 1.5, groundFn: field.height,
    region: { minX: -10, maxX: 45, minZ: -35, maxZ: 35 }, rng: () => rayRng.next(),
  });
  for (const g of [ribbontails, eagles]) {
    app.add(g.mesh);
    app.onUpdate((dt, t) => g.update(dt, t));
  }

  // --- Diver + tour -------------------------------------------------------------
  // A loop across the reef flat, down a groove, around the bommies and back up.
  // Swing past the bommie nearest the foot of the slope.
  const bom = [...field.bommies].sort((a, b) => Math.hypot(a.x - 18, a.z) - Math.hypot(b.x - 18, b.z))[0] || { x: 22, z: 0, r: 3 };
  const anchors = [
    [-32, -8], [-26, 4], [-18, 12], [-8, 8], [0, 16], [8, 8],
    [bom.x - bom.r - 3, bom.z + bom.r + 2], [bom.x + bom.r + 3, bom.z], [bom.x - bom.r - 3, bom.z - bom.r - 2],
    [6, -10], [-4, -18], [-14, -12], [-24, -20],
  ];
  const flatCurve = new THREE.CatmullRomCurve3(anchors.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const dense = flatCurve.getSpacedPoints(160);
  dense.pop();
  for (const p of dense) {
    let h = -Infinity;
    for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) h = Math.max(h, field.height(p.x + dx, p.z + dz));
    p.y = Math.min(h + 2.3, surfaceY - 1.2);
  }
  // Smooth the height profile so the glide is gentle.
  for (let pass = 0; pass < 4; pass++) {
    const ys = dense.map((p) => p.y);
    dense.forEach((p, i) => {
      const a = ys[(i - 1 + ys.length) % ys.length], b = ys[(i + 1) % ys.length];
      p.y = Math.max(ys[i], (a + ys[i] * 2 + b) / 4);
    });
  }
  const tourCurve = new THREE.CatmullRomCurve3(dense, true, 'centripetal');
  const controls = app.useSwimControls({ tour: tourCurve, startTour: tour });
  const start = tourCurve.getPointAt(0);
  controls.setPose(start, tourCurve.getPointAt(0.01).add(new THREE.Vector3(0, -0.6, 0)));

  // Look-dev helper: frame a given subject (?near=clam|anemone|ribbontail|eagleRay|chromis).
  const frame = (kind) => {
    let p;
    if (placements[kind]?.length) {
      const list = [...placements[kind]].sort((a, b) => a.z - b.z);
      const c = list[Math.floor(list.length / 2)];
      p = new THREE.Vector3(c.x, c.y + 0.3, c.z);
    } else if (kind === 'ribbontail') p = ribbontails.agents[0].pos.clone();
    else if (kind === 'eagleRay') p = eagles.agents[0].pos.clone();
    else if (kind === 'chromis') p = chromisHomes[0].clone();
    if (!p) return;
    const d = kind === 'eagleRay' ? 4.5 : kind === 'chromis' ? 2.2 : 1.6;
    const cam = p.clone().add(new THREE.Vector3(d, d * 0.55, d * 0.6));
    cam.y = Math.max(cam.y, field.height(cam.x, cam.z) + 0.6);
    controls.setPose(cam, p);
  };

  return { field, counts, schools, rays: [ribbontails, eagles], tourCurve, controls, frame };
}
