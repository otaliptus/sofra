import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const three = 'node_modules/three';
const pages = ['index.html', 'table.html', 'workbench.css', 'styles.css'];
const scripts = (await readdir(root)).filter(name => name.endsWith('.js'));
const artwork = (await readdir(join(root, 'assets')))
  .filter(name => name.endsWith('.webp'))
  .map(name => join('assets', name));
const renderer = [three + '/build/three.module.js', three + '/build/three.core.js', three + '/LICENSE'];

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
await mkdir(join(output, three, 'build'), { recursive: true });
await Promise.all([...pages, ...scripts, ...artwork, ...renderer].map(
  file => copyFile(join(root, file), join(output, file))
));
