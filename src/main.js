import { App } from './core/app.js';
import { buildReef } from './scenes/reef.js';
import { buildShowcase } from './scenes/showcase.js';
import { buildGBR } from './scenes/gbr.js';
import { DECOR, FISH, RAYS, ANIMALS } from './assets/catalog.js';
import { setupUI } from './ui.js';
import { installGlobalHandlers, showError, clearErrors, webgl2Problem, pickQuality } from './core/diagnostics.js';

installGlobalHandlers();

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const container = document.getElementById('app');
const quality = pickQuality();
const known = (name) => Boolean(name && (name === 'aquarium' || DECOR[name] || FISH[name] || RAYS[name] || ANIMALS[name]));

// What to show: the reef by default, `aquarium` for the proof-of-concept
// tank, or a single asset. From ?asset=name or a #name deep link.
const initial = params.get('asset') || (known(location.hash.slice(1)) ? location.hash.slice(1) : null);

let app = null;

function boot(asset) {
  if (app) app.dispose();
  clearErrors();
  app = new App(container, { shot, quality });
  try {
    if (asset === 'aquarium') buildReef(app);
    else if (asset) buildShowcase(app, asset);
    else app.scene.userData.gbr = buildGBR(app, { tour: !shot });
  } catch (e) {
    console.error(e);
    showError('The scene could not be built', e.stack || e.message || String(e));
  }
  window.app = app;
  return app;
}

const problem = webgl2Problem();
if (problem) {
  document.getElementById('loading')?.remove();
  showError('This device or browser cannot show the aquarium', problem);
  throw new Error(problem);
}
const bootStart = performance.now();
boot(initial);
window.__bootMs = Math.round(performance.now() - bootStart);
window.__reefStarted = true;
document.getElementById('loading')?.remove();

// Optional camera override for screenshots: ?cam=x,y,z&target=x,y,z
const vec = (s) => s.split(',').map(Number);
if (app.controls.isSwim) {
  if (params.get('cam') && params.get('target')) {
    app.controls.setPose(new app.camera.position.constructor(...vec(params.get('cam'))), new app.camera.position.constructor(...vec(params.get('target'))));
  } else if (params.get('near')) {
    // Warm up first so animals have moved, then frame the subject.
    app.scene.userData.frameNear = params.get('near');
  } else if (params.get('tour')) {
    // Screenshot a point along the tour: ?tour=0.35
    const c = app.controls.tour;
    const u = Number(params.get('tour'));
    app.controls.setPose(c.getPointAt(u), c.getPointAt((u + 0.01) % 1).add(new app.camera.position.constructor(0, -0.8, 0)));
  }
} else {
  if (params.get('cam')) app.camera.position.set(...vec(params.get('cam')));
  if (params.get('target')) app.controls.target.set(...vec(params.get('target')));
}
if (params.get('fov')) {
  app.camera.fov = Number(params.get('fov'));
  app.camera.updateProjectionMatrix();
}
if (!app.controls.isSwim) app.controls.update();

if (shot) {
  // Deterministic warm-up so fish have spread out, then signal readiness.
  const warm = Number(params.get('t') ?? 6);
  const steps = Math.ceil(warm / 0.05);
  for (let i = 0; i < steps; i++) app.step(0.05);
  if (app.scene.userData.frameNear) {
    // Two steps: the first refreshes distance culling for the new viewpoint.
    for (let i = 0; i < 2; i++) {
      app.scene.userData.gbr.frame(app.scene.userData.frameNear);
      app.step(0.05);
    }
  }
  app.render();
  requestAnimationFrame(() => {
    app.renderer.info.autoReset = false;
    app.renderer.info.reset();
    app.render();
    app.renderer.info.autoReset = true;
    const ri = app.renderer.info.render;
    window.__info = JSON.stringify({ counts: app.scene.userData.gbr?.counts, calls: ri.calls, triangles: ri.triangles });
    window.__ready = true;
  });
} else {
  const select = (asset) => {
    try {
      history.replaceState(null, '', asset ? `#${asset}` : location.pathname + location.search.replace(/[?&]asset=[^&]*/, ''));
    } catch {
      /* sandboxed frames may refuse history changes */
    }
    boot(asset).start();
    setupUI(app, { asset, DECOR, FISH, RAYS, ANIMALS, onSelect: select });
  };
  app.start();
  setupUI(app, { asset: initial, DECOR, FISH, RAYS, ANIMALS, onSelect: select });
}
