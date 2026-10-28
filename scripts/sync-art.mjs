// Copies the sprite atlases from design/art/atlas into public/art/atlas (plan §1, §8).
//
//   npm run sync:art            copy
//   npm run sync:art -- --check fail if the copy differs from design/
//
// design/ is a shared folder, not a repo, so the copy is committed here: a Vercel build of
// this repo alone needs the files. Final art replaces design/art/atlas/*, then this runs again.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, process.env.POCKET_LEGIONS_ART ?? '../design/art/atlas');
const outDir = join(root, 'public', 'art', 'atlas');
const check = process.argv.includes('--check');
/** The README stays in design/; the game needs only the data and the pages. */
const wanted = (name) => /\.(json|webp|png)$/.test(name);

if (!existsSync(join(sourceDir, 'index.json'))) {
  const message = `sync-art: no atlases at ${sourceDir}`;
  if (check) {
    console.warn(`${message} — skipping the check`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const files = readdirSync(sourceDir).filter(wanted).sort();
const existing = existsSync(outDir) ? readdirSync(outDir).filter(wanted) : [];

if (check) {
  const problems = [];
  for (const name of files) {
    const target = join(outDir, name);
    if (!existsSync(target)) problems.push(`missing ${name}`);
    else if (!readFileSync(target).equals(readFileSync(join(sourceDir, name)))) problems.push(`differs ${name}`);
  }
  for (const name of existing) if (!files.includes(name)) problems.push(`extra ${name}`);
  if (problems.length) {
    console.error('sync-art --check: public/art/atlas is out of date with design/art/atlas');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`sync-art --check: OK (${files.length} files)`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
for (const name of existing) if (!files.includes(name)) rmSync(join(outDir, name));
let bytes = 0;
for (const name of files) {
  const data = readFileSync(join(sourceDir, name));
  bytes += data.length;
  writeFileSync(join(outDir, name), data);
}
console.log(`sync-art: copied ${files.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB) from ${sourceDir}`);
