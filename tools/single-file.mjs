// Inlines the preview build's script and stylesheet into one self-contained HTML file.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'preview';
let html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = readdirSync(join(dir, 'assets'));
for (const f of assets) {
  const body = readFileSync(join(dir, 'assets', f), 'utf8');
  if (f.endsWith('.js')) {
    html = html.replace(new RegExp(`<script type="module" crossorigin src="./assets/${f.replace('.', '\\.')}"></script>`), () => `<script type="module">${body.replace(/<\/script/g, '<\\/script')}</script>`);
  } else if (f.endsWith('.css')) {
    html = html.replace(new RegExp(`<link rel="stylesheet" crossorigin href="./assets/${f.replace('.', '\\.')}">`), () => `<style>${body}</style>`);
  }
}
if (/assets\//.test(html)) throw new Error('Unresolved asset reference left in preview HTML');
writeFileSync(join(dir, 'bloq.html'), html);
console.log(`preview/bloq.html: ${(html.length / 1024).toFixed(1)} KB`);

// Artifact flavour: the claude.ai artifact host supplies its own document skeleton and viewport meta.
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '')
  .replace(/<meta name="apple-[^>]*>/g, '')
  .replace(/<meta name="theme-color"[^>]*>/, '');
const title = '<title>BLOQ</title>';
const artifact = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${head.replace(title, '')}\n${body}`;
writeFileSync(join(dir, 'bloq-artifact.html'), artifact);
console.log(`preview/bloq-artifact.html: ${(artifact.length / 1024).toFixed(1)} KB`);
