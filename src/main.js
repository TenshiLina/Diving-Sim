import { App } from './core/app.js';
import { buildReef } from './scenes/reef.js';
import { buildShowcase } from './scenes/showcase.js';
import { DECOR, FISH } from './assets/catalog.js';
import { setupUI } from './ui.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const container = document.getElementById('app');
const app = new App(container, { shot });
const asset = params.get('asset');

try {
  if (asset) buildShowcase(app, asset);
  else buildReef(app);
} catch (e) {
  console.error(e);
  document.getElementById('error').textContent = String(e.message || e);
}

// Optional camera override for screenshots: ?cam=x,y,z&target=x,y,z
const vec = (s) => s.split(',').map(Number);
if (params.get('cam')) app.camera.position.set(...vec(params.get('cam')));
if (params.get('target')) app.controls.target.set(...vec(params.get('target')));
if (params.get('fov')) {
  app.camera.fov = Number(params.get('fov'));
  app.camera.updateProjectionMatrix();
}
app.controls.update();

if (!shot) setupUI(app, { asset, DECOR, FISH });

window.app = app;
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
  app.start();
}
