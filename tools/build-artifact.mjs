// Writes a copy of index.html without the document wrapper (doctype, html, head,
// body tags) for hosts that supply their own, such as a claude.ai Artifact.
//   node tools/build-artifact.mjs out/index.html
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.argv[2] || 'build/artifact.html');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
await mkdir(dirname(out), { recursive: true });
await writeFile(out, head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', out);
