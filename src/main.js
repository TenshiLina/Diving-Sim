import { App } from './core/app.js';
import { buildReef } from './scenes/reef.js';
import { buildShowcase } from './scenes/showcase.js';
import { DECOR, FISH } from './assets/catalog.js';
import { setupUI } from './ui.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const container = document.getElementById('app');
const errorEl = document.getElementById('error');
const known = (name) => Boolean(name && (DECOR[name] || FISH[name]));

// The asset can come from ?asset=name or a #name deep link.
const initial = params.get('asset') || (known(location.hash.slice(1)) ? location.hash.slice(1) : null);

let app = null;

function boot(asset) {
  if (app) app.dispose();
  errorEl.textContent = '';
  app = new App(container, { shot });
  try {
    if (asset) buildShowcase(app, asset);
    else buildReef(app);
  } catch (e) {
    console.error(e);
    errorEl.textContent = String(e.message || e);
  }
  window.app = app;
  return app;
}

boot(initial);

// Optional camera override for screenshots: ?cam=x,y,z&target=x,y,z
const vec = (s) => s.split(',').map(Number);
if (params.get('cam')) app.camera.position.set(...vec(params.get('cam')));
if (params.get('target')) app.controls.target.set(...vec(params.get('target')));
if (params.get('fov')) {
  app.camera.fov = Number(params.get('fov'));
  app.camera.updateProjectionMatrix();
}
app.controls.update();

if (shot) {
  // Deterministic warm-up so fish have spread out, then signal readiness.
  const warm = Number(params.get('t') ?? 6);
  const steps = Math.ceil(warm / 0.05);
  for (let i = 0; i < steps; i++) app.step(0.05);
  app.render();
  requestAnimationFrame(() => {
    app.render();
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
    setupUI(app, { asset, DECOR, FISH, onSelect: select });
  };
  app.start();
  setupUI(app, { asset: initial, DECOR, FISH, onSelect: select });
}
