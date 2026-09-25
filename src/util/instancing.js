// Turn a handful of template objects into spatially-chunked InstancedMeshes
// with a simple two-level LOD.
//
// Each placement names a template variant and a world matrix. Placements are
// bucketed into square cells; every cell holds a detailed and a light version
// of its instances. Each frame `updateLOD(camera)` shows the detailed set near
// the diver, the light set further out, and nothing beyond the visibility
// range (the water haze hides it anyway). Only detailed sets cast shadows.

import * as THREE from 'three';

const _m = new THREE.Matrix4();

function flatten(root) {
  root.updateMatrixWorld(true);
  const list = [];
  root.traverse((o) => {
    if (o.isMesh) list.push({ geometry: o.geometry, material: o.material, local: o.matrixWorld.clone(), cast: o.castShadow });
  });
  return list;
}

function build(parts, mats, castShadow) {
  const g = new THREE.Group();
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, _m.multiplyMatrices(m, part.local)));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = castShadow && part.cast;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/**
 * @param {THREE.Object3D[]} variants      detailed templates (not added to the scene)
 * @param {{variant:number, matrix:THREE.Matrix4}[]} placements
 * @param {{far?:THREE.Object3D[], cell?:number, near?:number, range?:number, name?:string}} o
 */
export function instanceVariants(variants, placements, { far = null, cell = 12, near = 10, range = 44, name = 'instances' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const nearParts = variants.map(flatten);
  const farParts = far ? far.map(flatten) : null;
  const buckets = new Map();
  for (const p of placements) {
    const e = p.matrix.elements;
    const cx = Math.floor(e[12] / cell), cz = Math.floor(e[14] / cell);
    const key = `${cx}:${cz}`;
    if (!buckets.has(key)) buckets.set(key, { cx, cz, byVariant: new Map() });
    const b = buckets.get(key);
    if (!b.byVariant.has(p.variant)) b.byVariant.set(p.variant, []);
    b.byVariant.get(p.variant).push(p.matrix);
  }
  const chunks = [];
  for (const b of buckets.values()) {
    const nearG = new THREE.Group();
    const farG = new THREE.Group();
    for (const [v, mats] of b.byVariant) {
      nearG.add(build(nearParts[v], mats, true));
      if (farParts) farG.add(build(farParts[v], mats, false));
    }
    const center = new THREE.Vector3((b.cx + 0.5) * cell, 0, (b.cz + 0.5) * cell);
    group.add(nearG, farG);
    chunks.push({ center, nearG, farG });
  }
  const halfDiag = cell * Math.SQRT1_2;
  group.userData.updateLOD = (camera) => {
    const cp = camera.position;
    for (const c of chunks) {
      const d = Math.max(0, Math.hypot(c.center.x - cp.x, c.center.z - cp.z) - halfDiag);
      const showNear = d < near || !farParts;
      c.nearG.visible = showNear && d < range;
      c.farG.visible = !showNear && d < range;
    }
  };
  return group;
}

/** Count vertices drawn per instance of a template (for budgeting). */
export function vertexCount(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isMesh) n += o.geometry.attributes.position.count;
  });
  return n;
}
