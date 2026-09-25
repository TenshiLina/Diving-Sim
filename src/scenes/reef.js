// The proof-of-concept "aquarium": a single reef bommie on a sand flat,
// ringed by seagrass, with a handful of resident fish.

import * as THREE from 'three';
import { createSeabed, makeSeabedHeight } from '../assets/terrain/seabed.js';
import { createRock } from '../assets/terrain/rocks.js';
import { createBrainCoral } from '../assets/coral/brainCoral.js';
import { createStaghorn } from '../assets/coral/staghorn.js';
import { createTableCoral } from '../assets/coral/tableCoral.js';
import { createAnemone } from '../assets/coral/anemone.js';
import { createSeaFan } from '../assets/coral/seaFan.js';
import { createSeagrass } from '../assets/plants/seagrass.js';
import { getFish } from '../assets/catalog.js';
import { FishSchool } from '../assets/fish/school.js';
import { Rng } from '../util/noise.js';

export function buildReef(app) {
  const rng = new Rng(42);
  const heightFn = makeSeabedHeight(2);
  const seabed = createSeabed({ heightFn });
  app.add(seabed);
  app.groundFn = heightFn;

  // --- Bommie: a cluster of rocks -------------------------------------------
  const rocks = [];
  const rockDefs = [
    { p: [0, 0, 0], r: 1.35, f: 0.75, s: 1 },
    { p: [1.3, 0, 0.5], r: 0.9, f: 0.7, s: 2 },
    { p: [-1.2, 0, 0.4], r: 1.0, f: 0.6, s: 3 },
    { p: [0.3, 0, -1.3], r: 1.0, f: 0.8, s: 4 },
    { p: [-0.6, 0.6, -0.3], r: 0.75, f: 0.9, s: 5 },
    { p: [2.4, 0, -0.9], r: 0.5, f: 0.7, s: 6 },
    { p: [-2.3, 0, -1.2], r: 0.55, f: 0.65, s: 7 },
  ];
  for (const d of rockDefs) {
    const rock = createRock({ radius: d.r, flatten: d.f, seed: d.s });
    rock.position.set(d.p[0], heightFn(d.p[0], d.p[2]) + d.p[1] - 0.05, d.p[2]);
    rock.rotation.y = rng.float(0, Math.PI * 2);
    app.add(rock);
    rocks.push(rock);
  }
  app.scene.updateMatrixWorld(true);

  // Drop-placement helper: find the surface under (x, z).
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const surfaceAt = (x, z) => {
    ray.set(new THREE.Vector3(x, 20, z), down);
    const hit = ray.intersectObjects([...rocks, seabed], false)[0];
    return hit ? hit : { point: new THREE.Vector3(x, heightFn(x, z), z), face: { normal: new THREE.Vector3(0, 1, 0) } };
  };
  const place = (obj, x, z, { sink = 0.03, yaw = rng.float(0, Math.PI * 2), tiltWithSurface = 0.4 } = {}) => {
    const hit = surfaceAt(x, z);
    obj.position.copy(hit.point);
    obj.position.y -= sink;
    obj.rotation.y = yaw;
    if (hit.face && tiltWithSurface > 0) {
      const n = hit.face.normal.clone().transformDirection(hit.object ? hit.object.matrixWorld : new THREE.Matrix4());
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).lerp(n, tiltWithSurface).normalize());
      obj.quaternion.premultiply(q);
    }
    app.add(obj);
    return obj;
  };

  // --- Corals ---------------------------------------------------------------
  const brain = place(createBrainCoral({ radius: 0.5, seed: 3 }), 0.1, 0.2, { sink: 0.06 });
  place(createBrainCoral({ radius: 0.3, seed: 8, palette: 'green' }), 1.5, 0.9, { sink: 0.04 });
  place(createBrainCoral({ radius: 0.22, seed: 9, palette: 'lime' }), -0.9, 1.1, { sink: 0.03 });
  place(createBrainCoral({ radius: 0.26, seed: 10 }), 0.7, -0.6, { sink: 0.03 });
  place(createBrainCoral({ radius: 0.35, seed: 14, palette: 'green' }), -3.2, 1.6, { sink: 0.05 });
  // Table coral on the sand flank, low enough to see its upper surface.
  place(createTableCoral({ radius: 0.8, seed: 4, palette: 'sage', stalkHeight: 0.35 }), 2.9, -1.9, { sink: 0.02, tiltWithSurface: 0 });
  place(createTableCoral({ radius: 0.45, seed: 6, palette: 'teal', stalkHeight: 0.18 }), -0.2, -1.2, { sink: 0.02, tiltWithSurface: 0.2 });
  // Staghorn thickets
  place(createStaghorn({ seed: 11, size: 1.0, palette: 'tan' }), -1.5, 0.9, { sink: 0.02 });
  place(createStaghorn({ seed: 12, size: 0.8, palette: 'blue', trunks: 6 }), 1.0, -1.0, { sink: 0.02 });
  place(createStaghorn({ seed: 13, size: 0.75, palette: 'purple', trunks: 7 }), -2.4, -0.6, { sink: 0.02 });
  place(createStaghorn({ seed: 15, size: 0.9, palette: 'cream' }), -0.5, 0.4, { sink: 0.02 });
  place(createStaghorn({ seed: 16, size: 0.6, palette: 'tan', trunks: 6 }), 2.1, 0.1, { sink: 0.02 });
  place(createStaghorn({ seed: 17, size: 1.1, palette: 'blue' }), -1.3, -1.9, { sink: 0.02 });
  place(createStaghorn({ seed: 18, size: 0.7, palette: 'cream', trunks: 7 }), 0.9, 1.5, { sink: 0.02 });
  // Sea fans stand across the current.
  place(createSeaFan({ height: 1.2, seed: 21, palette: 'orange' }), 0.6, -1.6, { sink: 0.02, yaw: 0.3, tiltWithSurface: 0 });
  place(createSeaFan({ height: 0.8, seed: 22, palette: 'purple' }), -1.9, -1.3, { sink: 0.02, yaw: -0.4, tiltWithSurface: 0 });
  place(createSeaFan({ height: 0.6, seed: 23, palette: 'yellow' }), 2.4, -0.8, { sink: 0.02, yaw: 0.1, tiltWithSurface: 0 });
  const anemone = place(createAnemone({ radius: 0.34, seed: 5 }), 1.35, 0.35, { sink: 0.04, tiltWithSurface: 0.3 });
  place(createAnemone({ radius: 0.2, seed: 6, palette: 'green', tentacles: 400 }), -2.0, 0.2, { sink: 0.03, tiltWithSurface: 0.3 });

  // Satellite outcrops on the sand.
  for (const [x, z, r, seed] of [[4.5, 2.5, 0.45, 31], [-4.2, -2.8, 0.5, 32], [3.8, -4.2, 0.35, 33], [-5.2, 2.6, 0.4, 34]]) {
    const rock = createRock({ radius: r, seed, flatten: 0.7 });
    rock.position.set(x, heightFn(x, z) - 0.05, z);
    app.add(rock);
    rocks.push(rock);
    rock.updateMatrixWorld(true);
    place(createStaghorn({ seed: seed + 10, size: 0.5, palette: rng.pick(['tan', 'blue', 'cream', 'purple']), trunks: 6 }), x + 0.1, z - 0.1, { sink: 0.02 });
  }

  // --- Seagrass meadows around the bommie ---------------------------------------
  for (let i = 0; i < 26; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(3.2, 9);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    place(createSeagrass({ seed: 100 + i, blades: rng.int(25, 55), spread: rng.float(0.2, 0.45), height: rng.float(0.3, 0.6) }), x, z, { sink: 0.0, tiltWithSurface: 0 });
  }

  // --- Fish -------------------------------------------------------------------
  const ground = (x, z) => {
    // Coarse: bommie is ~1.5 m tall near the centre.
    const r = Math.hypot(x, z);
    return Math.max(heightFn(x, z), r < 2.6 ? 1.6 * (1 - (r / 2.6) ** 2) : 0);
  };
  const obstacles = [{ center: new THREE.Vector3(0, 0.3, 0), radius: 1.5 }];
  const anemoneTop = anemone.position.clone().add(new THREE.Vector3(0, 0.25, 0));
  const schools = [
    new FishSchool(getFish('clownfish'), {
      count: 3, home: anemoneTop, homeRadius: 0.45, homeStrength: 2.5, cruise: 0.08, speed: [0.03, 0.2],
      neighbor: 0.4, separation: 0.12, wander: 1.2, minHeight: 0.0, groundFn: () => anemone.position.y + 0.1, seed: 1, maxPitch: 0.35,
    }),
    new FishSchool(getFish('chromis'), {
      count: 22, home: new THREE.Vector3(-1.4, 1.9, 0.9), homeRadius: 1.0, homeStrength: 1.2, cruise: 0.14, speed: [0.05, 0.35],
      neighbor: 0.5, separation: 0.12, wAli: 0.9, wCoh: 0.6, wander: 0.5, groundFn: ground, minHeight: 0.35, seed: 2,
    }),
    new FishSchool(getFish('blueTang'), {
      count: 4, home: new THREE.Vector3(0, 1.8, 0), homeRadius: 5, homeStrength: 0.5, cruise: 0.35, speed: [0.15, 0.6],
      neighbor: 1.5, separation: 0.5, wander: 0.8, groundFn: ground, minHeight: 0.5, obstacles, seed: 3,
    }),
    new FishSchool(getFish('butterflyfish'), {
      count: 2, home: new THREE.Vector3(0.5, 1.2, 1.2), homeRadius: 3, homeStrength: 0.6, cruise: 0.22, speed: [0.08, 0.4],
      neighbor: 1.2, separation: 0.35, wAli: 1.2, wCoh: 1.0, wander: 0.7, groundFn: ground, minHeight: 0.4, obstacles, seed: 4,
    }),
  ];
  for (const s of schools) {
    app.add(s.group);
    app.onUpdate((dt, t) => s.update(dt, t));
  }

  app.controls.target.set(0, 1.0, 0);
  app.camera.position.set(4.6, 2.2, 5.4);
  app.controls.update();
  return { rocks, brain, anemone, schools };
}
