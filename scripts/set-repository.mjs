// Point the published metadata at your fork without hand-editing JSON.
//
// Usage:
//   node scripts/set-repository.mjs                     # uses DSH_FONT_STACK_REPO or the default
//   DSH_FONT_STACK_REPO=your-name/dsh-font-stack node scripts/set-repository.mjs
//
// Rewrites only homepage / repository / bugs in package.json, preserving the
// rest of the file's key order and formatting.
import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_REPO = 'vanvanhasnophi/dsh-custom-font';
const SLUG_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

const slug = process.env.DSH_FONT_STACK_REPO ?? process.argv[2] ?? DEFAULT_REPO;
if (!SLUG_PATTERN.test(slug)) {
  console.error(`not a GitHub "owner/repo" slug: ${JSON.stringify(slug)}`);
  process.exit(1);
}

const packagePath = new URL('../package.json', import.meta.url);
const source = readFileSync(packagePath, 'utf8');
const manifest = JSON.parse(source);

const replacements = {
  homepage: `https://github.com/${slug}#readme`,
  repository: { type: 'git', url: `git+https://github.com/${slug}.git` },
  bugs: { url: `https://github.com/${slug}/issues` },
};

let changed = false;
for (const [key, value] of Object.entries(replacements)) {
  if (JSON.stringify(manifest[key]) === JSON.stringify(value)) continue;
  manifest[key] = value;
  changed = true;
}

if (!changed) {
  console.log(`package.json already points at ${slug}`);
  process.exit(0);
}

// Serialize with the same shape the file already uses: two-space indent, the
// nested objects still inlined by JSON.stringify's default key order.
writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`package.json now points at ${slug}`);

const remote = readFileSync(new URL('../.git/config', import.meta.url), 'utf8');
if (!remote.includes(`github.com/${slug}`)) {
  console.log(`\nnote: the git remote still differs. Update it with:\n  git remote set-url origin https://github.com/${slug}.git`);
}
