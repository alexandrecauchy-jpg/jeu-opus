// Construit dist/donjon-des-os.html : un fichier HTML unique et autonome
// (code regroupé + modèles Blender intégrés en base64), jouable sans serveur web.
// Usage : npm install && npm run build:single
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = join(root, 'game');

const bundle = await build({
  entryPoints: [join(game, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
  plugins: [{
    name: 'three-local',
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: join(game, 'vendor/three.module.js') }));
      b.onResolve({ filter: /^three\/addons\// }, a => ({ path: join(game, 'vendor/addons', a.path.slice('three/addons/'.length)) }));
    },
  }],
});
const js = bundle.outputFiles[0].text;

const assets = {};
for (const f of readdirSync(join(game, 'assets'))) {
  if (f.endsWith('.glb')) assets[f.slice(0, -4)] = readFileSync(join(game, 'assets', f)).toString('base64');
}

let html = readFileSync(join(game, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
html = html.replace(
  '<script type="module" src="js/main.js"></script>',
  () => `<script>window.__EMBEDDED_ASSETS=${JSON.stringify(assets)};</script>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
);
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist/donjon-des-os.html');
writeFileSync(out, html);
console.log(`${out} — ${(html.length / 1e6).toFixed(2)} Mo`);
