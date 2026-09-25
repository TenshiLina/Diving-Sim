// Budget probe: builds a view headlessly and lists triangles per scene group
// (before frustum culling) plus the boot time.
//   node tools/probe.mjs "tour=0.3"

import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node22/lib/node_modules/playwright');
const server = await createServer({ server: { port: 5192 }, logLevel: 'error' });
await server.listen();
const b = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5195/?shot&t=2&' + (process.argv[2] || ''), { waitUntil: 'commit', timeout: 120000 });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
console.log('boot ms', await p.evaluate(() => window.__bootMs));
const r = await p.evaluate(() => {
  const app = window.app; const out = {}; const cam = app.camera;
  app.scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    let top = o; while (top.parent && top.parent !== app.scene) top = top.parent;
    const g = o.geometry; const tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    out[top.name || o.name || '?'] = (out[top.name || o.name || '?'] || 0) + tris;
  });
  return Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${(v / 1e6).toFixed(2)}M`).join('\n');
});
console.log(r);
await b.close(); await server.close();
