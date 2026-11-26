import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { securityHeaders } from '../worker/security-headers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const staticDir = join(output, 'static');
const entries = {
  sofra: 'src/editor/main.js',
  pano: 'src/pano/main.js',
  printer: 'src/pano/worker.js',
  table: 'src/table/main.js',
};
const files = new Map();

async function publishFile(source) {
  const data = await readFile(join(root, source));
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const name = hash + '-' + basename(source);
  const url = './static/' + name;
  await writeFile(join(staticDir, name), data);
  files.set(source, url);
  return url;
}

async function publishArt(directory) {
  const names = (await readdir(join(root, directory))).filter(name => name.endsWith('.webp'));
  return Object.fromEntries(await Promise.all(names.map(async name => [
    basename(name, '.webp'), await publishFile(directory + '/' + name),
  ])));
}

await rm(output, { recursive: true, force: true });
await mkdir(staticDir, { recursive: true });
const [art, thumbs] = await Promise.all([publishArt('assets'), publishArt('assets/thumbs')]);
const styles = ['src/editor/workbench.css', 'src/pano/pano.css', 'src/table/styles.css'];
await Promise.all(styles.map(publishFile));

const options = {
  absWorkingDir: root,
  entryNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  outdir: staticDir,
  bundle: true,
  minify: true,
  keepNames: true,
  format: 'esm',
  target: 'es2022',
  define: { SOFRA_ART_URLS: JSON.stringify(art), SOFRA_THUMB_URLS: JSON.stringify(thumbs) },
  metafile: true,
};
// The original 2D table has its own bundle. Including it in code splitting
// would add four module requests to the main game's startup.
const { table, ...modern } = entries;
const [appBundle, tableBundle] = await Promise.all([
  build({ ...options, entryPoints: modern, splitting: true }),
  build({ ...options, entryPoints: { table } }),
]);
const chunks = { ...appBundle.metafile.outputs, ...tableBundle.metafile.outputs };

const outputs = new Map();
for (const [file, meta] of Object.entries(chunks)) {
  if (!meta.entryPoint) continue;
  outputs.set(meta.entryPoint, file);
  files.set(meta.entryPoint, './static/' + basename(file));
}

function modulePreloads(sources) {
  const preload = new Set(sources.map(source => outputs.get(source)));
  for (const file of preload) {
    for (const dep of chunks[file].imports) {
      if (dep.kind === 'import-statement') preload.add(dep.path);
    }
  }
  return Array.from(preload, file => '<link rel="modulepreload" href="./static/' + basename(file) + '">');
}

async function publishPage(page, sources, extra = []) {
  const html = await readFile(join(root, page), 'utf8');
  // Page links stay relative so the HTML also works on a plain static server.
  const built = html.replace(/(src|href|content)="\.\/((?:src|assets)\/[^"]+)"/g, (_, attr, source) => {
    if (!files.has(source)) throw new Error(page + ' references an unpublished file: ' + source);
    return attr + '="' + files.get(source) + '"';
  });
  const hints = [...modulePreloads(sources), ...extra].join('\n  ');
  await writeFile(join(output, page), built.replace('</head>', hints + '\n</head>'));
  return html;
}

const [home] = await Promise.all([
  publishPage('index.html', [entries.sofra, 'src/scene/board-3d.js'], [
    '<link rel="preload" as="image" href="' + art['kahvalti-tabagi'] + '">',
  ]),
  publishPage('pano.html', [entries.pano]),
  publishPage('table.html', [entries.table]),
]);

const redirectScript = home.match(/<script id="legacy-redirect">([^<]+)<\/script>/)[1];
const redirectHash = createHash('sha256').update(redirectScript).digest('base64');
const headers = Object.entries(securityHeaders(`'sha256-${redirectHash}'`))
  .map(([key, value]) => '  ' + key + ': ' + value).join('\n');
await writeFile(join(output, '_headers'), '/*\n' + headers + '\n/static/*\n  Cache-Control: public, max-age=31536000, immutable\n');

// Keep the original artwork URLs and the entry points referenced by older pages.
const aliases = new Map([...files].filter(([source]) => source.startsWith('assets/')));
for (const source of styles) aliases.set(basename(source), files.get(source));
for (const [old, source] of Object.entries({
  'simit.js': entries.sofra, 'pano.js': entries.pano, 'pano-worker.js': entries.printer,
  'app.js': entries.table,
})) {
  aliases.set(old, files.get(source));
}
const redirects = [...aliases].sort(([a], [b]) => a.localeCompare(b))
  .map(([source, url]) => '/' + source + ' ' + url.slice(1) + ' 302').join('\n');
await writeFile(join(output, '_redirects'), redirects + '\n');
await copyFile(join(root, 'node_modules/three/LICENSE'), join(output, 'three-LICENSE.txt'));
