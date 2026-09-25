// Single-asset viewer (?asset=name): the asset sits on the sand in the same
// water, framed by the camera. Used for look-dev and for feedback rounds.

import * as THREE from 'three';
import { DECOR, FISH, RAYS, ANIMALS, getFish } from '../assets/catalog.js';
import { createTurtle } from '../assets/turtle/turtle.js';
import { Octopus } from '../assets/octopus/octopus.js';
import { buildRay, RayGroup, RAY_SPECIES } from '../assets/rays/rays.js';
import { FishSchool } from '../assets/fish/school.js';
import { createSeabed, makeSeabedHeight } from '../assets/terrain/seabed.js';

export function buildShowcase(app, name) {
  const heightFn = makeSeabedHeight(2);
  const flat = (x, z) => heightFn(x, z) * 0.3 - 0.1;
  const bed = createSeabed({ heightFn: flat });
  app.add(bed);
  app.groundFn = flat;

  let size;
  let center;
  if (DECOR[name]) {
    const obj = DECOR[name].create();
    const y0 = flat(0, 0);
    obj.position.set(0, y0, 0);
    app.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    size = box.getSize(new THREE.Vector3()).length();
    center = box.getCenter(new THREE.Vector3());
  } else if (FISH[name]) {
    const built = getFish(name);
    const school = new FishSchool(built, { count: 1, static: true, cruise: 0.25 });
    center = new THREE.Vector3(0, 0.6, 0);
    school.setPose(0, center, 0);
    app.add(school.group);
    app.onUpdate((dt, t) => school.update(dt, t));
    // Tall or long fish (idol streamer, shark) need a wider frame.
    const b = built.bounds;
    const extent = Math.max((b.xmax - b.xmin) * 1.1, (b.ymax - b.ymin) * 1.3);
    size = built.scale * Math.max(1.5, extent);
    if (extent > 1.5) center.set(built.scale * (b.xmin + b.xmax) * 0.5, 0.6 + built.scale * (b.ymin + b.ymax) * 0.5, 0);
  } else if (RAYS[name]) {
    const built = buildRay(RAY_SPECIES[name]);
    const flier = name === 'eagleRay' || name === 'manta';
    const group = new RayGroup(built, { count: 1, static: true, mode: flier ? 'cruise' : 'bottom' });
    center = new THREE.Vector3(0, 0.5, 0);
    group.agents[0].pos.copy(center);
    group.agents[0].quat.identity();
    app.add(group.mesh);
    app.onUpdate((dt, t) => group.update(dt, t));
    size = built.scale * (name === 'manta' ? 3.4 : name === 'eagleRay' ? 2.2 : 2.4);
    if (name === 'manta') center.y = 1.2;
    group.agents[0].pos.copy(center);
  } else if (name === 'turtle') {
    const rig = createTurtle({ length: 1.0 });
    center = new THREE.Vector3(0, 0.7, 0);
    rig.group.position.copy(center);
    app.add(rig.group);
    app.onUpdate((dt, t) => rig.update(dt, 1, t));
    size = 1.5;
  } else if (name === 'octopus') {
    const octo = new Octopus({ size: 1, seed: 3 });
    const y0 = flat(0, 0);
    octo.group.position.set(0, y0, 0);
    app.add(octo.group);
    app.onUpdate((dt, t) => {
      // Cycle through the poses so all of them can be reviewed.
      const k = (t % 24) / 24;
      octo.jet = THREE.MathUtils.smoothstep(k, 0.62, 0.7) * (1 - THREE.MathUtils.smoothstep(k, 0.9, 0.98));
      octo.crawl = THREE.MathUtils.smoothstep(k, 0.3, 0.36) * (1 - THREE.MathUtils.smoothstep(k, 0.55, 0.6));
      octo.uniforms.uDisplay.value = THREE.MathUtils.smoothstep(Math.sin(t * 0.4), 0.6, 0.9);
      octo.group.position.y = y0 + 0.3 * octo.jet;
      octo.updateArms(dt);
    });
    center = new THREE.Vector3(0, y0 + 0.1, 0);
    size = 1.0;
  } else {
    throw new Error(`Unknown asset "${name}". Try one of: ${[...Object.keys(DECOR), ...Object.keys(FISH), ...Object.keys(RAYS), ...Object.keys(ANIMALS)].join(', ')}`);
  }
  app.controls.target.copy(center);
  const dist = size * 0.8 + 0.05;
  app.camera.position.copy(center).add(new THREE.Vector3(0.35, 0.45, 1).normalize().multiplyScalar(dist));
  app.controls.minDistance = size * 0.2;
  app.controls.update();
  return { center, size };
}
