import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { securityHeaders } from './worker/security-headers.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const three = 'node_modules/three';
const pages = ['table.html', 'workbench.css', 'styles.css'];
const scripts = (await readdir(root)).filter(name => name.endsWith('.js'));
const artwork = (await readdir(join(root, 'assets')))
  .filter(name => name.endsWith('.webp'))
  .map(name => join('assets', name));
const thumbnails=(await readdir(join(root,'assets/thumbs'))).map(file=>join('assets/thumbs',file));
const renderer = [three + '/build/three.module.js', three + '/build/three.core.js', three + '/LICENSE'];

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets/thumbs'), { recursive: true });
await mkdir(join(output, three, 'build'), { recursive: true });
const staticDir = join(output, 'static');
await mkdir(staticDir);
await Promise.all([...pages, ...scripts, ...artwork, ...thumbnails, ...renderer].map(
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
const thumbURLs=Object.fromEntries(await Promise.all(thumbnails.map(async file=>[
  basename(file,'.webp'),await publishStatic(file)
])));
const stylesheet = await publishStatic('workbench.css');

// The development server uses native ES modules. In production one versioned
// module avoids serial discovery and parsing of the unused parts of Three.js.
async function bundleEntries(){
  const bundle = await build({
    absWorkingDir: root,
    entryPoints: {sofra:'simit.js',pano:'pano.js'},
    entryNames: '[name]-[hash]',
    chunkNames: '[name]-[hash]',
    splitting: true,
    outdir: staticDir,
    bundle: true,
    minify: true,
    keepNames: true,
    format: 'esm',
    target: 'es2022',
    define: { SOFRA_ART_URLS: JSON.stringify(artURLs), SOFRA_THUMB_URLS: JSON.stringify(thumbURLs) },
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
  const files=Object.entries(bundle.metafile.outputs);
  const entry=id=>files.find(([,meta])=>meta.entryPoint===id)[0];
  const script=entry('simit.js'),panoScript=entry('pano.js');
  const imports=new Set();
  function dependencies(file){
    for(const item of bundle.metafile.outputs[file].imports){
      if(item.kind!=='import-statement'||imports.has(item.path))continue;
      imports.add(item.path);dependencies(item.path);
    }
  }
  dependencies(script);
  return {script:basename(script),panoScript:basename(panoScript),imports:[...imports].map(file=>basename(file))};
}
const [{script,panoScript,imports},panoCSS]=await Promise.all([bundleEntries(),publishStatic('pano.css')]);
const boardPage=await readFile(join(root,'pano.html'),'utf8');
await writeFile(join(output,'pano.html'),boardPage.replace('./pano.js','./static/'+panoScript).replace('./pano.css',panoCSS).replace('./assets/simit-kapak.webp',artURLs['simit-kapak']));
const html = await readFile(join(root, 'index.html'), 'utf8');
const preload=[
  ...[script,...imports].map(file=>'<link rel="modulepreload" href="./static/'+file+'">'),
  '<link rel="preload" as="image" href="'+artURLs['kahvalti-tabagi']+'">'
].join('\n  ');
await writeFile(join(output, 'index.html'), html
  .replace(/src="simit\.js[^"]*"/, 'src="./static/' + script + '"')
  .replace(/href="workbench\.css[^"]*"/, 'href="' + stylesheet + '"')
  .replace('./assets/knife.webp', artURLs.knife)
  .replace('</head>', '  ' + preload + '\n</head>'));
const redirectScript=html.match(/<script id="legacy-redirect">([^<]+)<\/script>/)[1];
const redirectHash=createHash('sha256').update(redirectScript).digest('base64');
const staticHeaders=Object.entries(securityHeaders(`'sha256-${redirectHash}'`)).map(([key,value])=>'  '+key+': '+value).join('\n');
await writeFile(join(output,'_headers'),`/*
${staticHeaders}
/static/*
  Cache-Control: public, max-age=31536000, immutable
`);
