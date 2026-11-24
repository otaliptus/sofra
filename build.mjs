import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const three = 'node_modules/three';
const pages = ['table.html', 'workbench.css', 'styles.css'];
const scripts = (await readdir(root)).filter(name => name.endsWith('.js'));
const artwork = (await readdir(join(root, 'assets')))
  .filter(name => name.endsWith('.webp'))
  .map(name => join('assets', name));
const renderer = [three + '/build/three.module.js', three + '/build/three.core.js', three + '/LICENSE'];

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
await mkdir(join(output, three, 'build'), { recursive: true });
const staticDir = join(output, 'static');
await mkdir(staticDir);
await Promise.all([...pages, ...scripts, ...artwork, ...renderer].map(
  file => copyFile(join(root, file), join(output, file))
));

async function publishStatic(file) {
  const data = await readFile(join(root, file));
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const name = hash + '-' + basename(file);
  await writeFile(join(staticDir, name), data);
  return './static/' + name;
}
const artURLs = Object.fromEntries(await Promise.all(artwork.map(async file => [
  basename(file, '.webp'), await publishStatic(file)
])));
const stylesheet = await publishStatic('workbench.css');

// The development server uses native ES modules. In production one versioned
// module avoids serial discovery and parsing of the unused parts of Three.js.
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['simit.js'],
  entryNames: 'sofra-[hash]',
  outdir: staticDir,
  bundle: true,
  minify: true,
  keepNames: true,
  format: 'esm',
  target: 'es2022',
  define: { SOFRA_ART_URLS: JSON.stringify(artURLs) },
  metafile: true,
  plugins: [{
    name: 'local-module-versions',
    setup(builder) {
      builder.onResolve({filter: /^\.\/.*\.js\?v=/}, args => ({
        path: resolve(args.resolveDir, args.path.split('?')[0])
      }));
    }
  }]
});
const script = basename(Object.keys(bundle.metafile.outputs).find(file => file.endsWith('.js')));
const html = await readFile(join(root, 'index.html'), 'utf8');
const preload = ['kahvalti-tabagi', 'kareli-bezi', 'split-simit', 'simit-kapak', 'sesame-crust']
  .map(id => '<link rel="preload" as="image" href="' + artURLs[id] + '">').join('\n  ');
await writeFile(join(output, 'index.html'), html
  .replace(/src="simit\.js[^"]*"/, 'src="./static/' + script + '"')
  .replace(/href="workbench\.css[^"]*"/, 'href="' + stylesheet + '"')
  .replace('./assets/knife.webp', artURLs.knife)
  .replace('</head>', '  ' + preload + '\n</head>'));
await writeFile(join(output, '_headers'), '/static/*\n  Cache-Control: public, max-age=31536000, immutable\n');
