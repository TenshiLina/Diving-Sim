// Headless screenshot harness for visual iteration.
//
//   node tools/screenshot.mjs out.png "asset=clownfish" [more "name=query" pairs...]
//   node tools/screenshot.mjs shots/ reef="" clown="asset=clownfish&t=2"
//
// Starts a Vite dev server, renders each view in headless Chromium (SwiftShader
// WebGL) at 1280x720 and writes PNGs.

import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const [outDir, ...views] = process.argv.slice(2);
if (!outDir || views.length === 0) {
  console.error('usage: node tools/screenshot.mjs <outDir> name=query ...');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port;
const w = Number(process.env.W || 1280);
const h = Number(process.env.H || 720);

const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

for (const v of views) {
  const eq = v.indexOf('=');
  const name = v.slice(0, eq);
  const query = v.slice(eq + 1);
  const url = `http://localhost:${port}/?shot&${query}`;
  const t0 = Date.now();
  logs.length = 0;
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  } catch (e) {
    console.error(`timeout on ${name}`);
  }
  const file = join(outDir, `${name}.png`);
  // Read pixels straight from the WebGL canvas (faster and more reliable than
  // waiting on the compositor under SwiftShader).
  const dataUrl = await page.evaluate(() => {
    window.app.render();
    return window.app.renderer.domElement.toDataURL('image/png');
  });
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const errs = logs.filter((l) => /error|warn/i.test(l));
  console.log(`${file}  (${Date.now() - t0} ms)${errs.length ? '\n  ' + errs.slice(0, 8).join('\n  ') : ''}`);
}

await browser.close();
await server.close();
