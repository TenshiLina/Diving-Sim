// Post-build step: fold the JS bundle into the HTML so the aquarium is a
// single self-contained file. Needed for hosts that only allow inline
// scripts (e.g. Claude artifacts) and handy for sharing offline.
//
//   npm run build:single   ->  dist/reef-aquarium.html   (complete document)
//                              dist/artifact.html        (body fragment for artifact hosting)

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const tag = html.match(/<script type="module" crossorigin src="\.\/assets\/([^"]+\.js)"><\/script>/);
if (!tag) throw new Error('bundle <script> tag not found in dist/index.html');
const js = readFileSync(join(dist, 'assets', tag[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
if (readdirSync(join(dist, 'assets')).some((f) => f.endsWith('.css'))) throw new Error('unexpected CSS asset; inline it too');
const inline = `<script type="module">\n${js}\n</script>`;
// Keep the app script at the end of <body> (Vite hoists it into <head>),
// so the body alone is a complete page for hosts that supply their own head.
html = html.replace(tag[0], '').replace('</body>', () => `${inline}\n  </body>`);
writeFileSync(join(dist, 'reef-aquarium.html'), html);

// Artifact hosting wraps the page in its own document skeleton.
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0].replace('<style>', '<style>\n      :root { color-scheme: dark; }');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].trim();
writeFileSync(join(dist, 'artifact.html'), `${title}\n${style}\n${body}\n`);
console.log(`single-file build: ${(html.length / 1024).toFixed(0)} KB`);
