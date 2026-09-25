// Single-asset viewer (?asset=name): the asset sits on the sand in the same
// water, framed by the camera. Used for look-dev and for feedback rounds.

import * as THREE from 'three';
import { DECOR, FISH, RAYS, getFish } from '../assets/catalog.js';
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
    size = built.scale * 1.5;
  } else if (RAYS[name]) {
    const built = buildRay(RAY_SPECIES[name]);
    const group = new RayGroup(built, { count: 1, static: true, mode: name === 'eagleRay' ? 'cruise' : 'bottom' });
    center = new THREE.Vector3(0, 0.5, 0);
    group.agents[0].pos.copy(center);
    group.agents[0].quat.identity();
    app.add(group.mesh);
    app.onUpdate((dt, t) => group.update(dt, t));
    size = built.scale * (name === 'eagleRay' ? 2.2 : 2.4);
  } else {
    throw new Error(`Unknown asset "${name}". Try one of: ${[...Object.keys(DECOR), ...Object.keys(FISH), ...Object.keys(RAYS)].join(', ')}`);
  }
  app.controls.target.copy(center);
  const dist = size * 0.8 + 0.05;
  app.camera.position.copy(center).add(new THREE.Vector3(0.35, 0.45, 1).normalize().multiplyScalar(dist));
  app.controls.minDistance = size * 0.2;
  app.controls.update();
  return { center, size };
}
