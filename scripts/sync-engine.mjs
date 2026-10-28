// Copies the pure engine of pocket-legions-api into src/app/engine (plan §4).
//
//   npm run sync:engine            copy
//   npm run sync:engine -- --check fail if the copy differs from the API checkout
//
// The list of what to copy is the API's own `client-sync.json`, never hard-coded here.
// The API checkout is `../pocket-legions-api` unless POCKET_LEGIONS_API points elsewhere.
// Without a checkout (a Vercel build of this repo alone) `--check` warns and passes: the
// committed copy is what gets built.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, process.env.POCKET_LEGIONS_API ?? '../pocket-legions-api');
const outDir = join(root, 'src', 'app', 'engine');
const check = process.argv.includes('--check');

if (!existsSync(join(apiDir, 'client-sync.json'))) {
  const message = `sync-engine: no API checkout at ${apiDir}`;
  if (check) {
    console.warn(`${message} — skipping the check, building the committed copy`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(apiDir, 'client-sync.json'), 'utf8'));
const excluded = (manifest.exclude ?? []).map(globToRegExp);
const isExcluded = (path) => excluded.some((pattern) => pattern.test(posix.basename(path)));

/** Paths relative to the API repo, with forward slashes. */
const sources = [];
for (const folder of manifest.folders) {
  for (const file of walk(join(apiDir, folder))) {
    const path = toPosix(relative(apiDir, file));
    if (!isExcluded(path)) sources.push(path);
  }
}
sources.push(...manifest.files);
sources.sort();

const commit = sourceCommit(sources);
const header = `// GENERATED from pocket-legions-api@${commit} — do not edit\n`;
const dataVersion = /DATA_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(join(apiDir, 'src/engine/version.ts'), 'utf8'))?.[1];
if (!dataVersion) {
  console.error('sync-engine: DATA_VERSION not found in src/engine/version.ts');
  process.exit(1);
}

/** Target path (relative to src/app/engine) → content. */
const expected = new Map();
for (const path of sources) {
  const target = path.replace(/^src\//, '');
  expected.set(target, header + lf(readFileSync(join(apiDir, path), 'utf8')));
}
expected.set('SOURCE.json', JSON.stringify({ commit, dataVersion, files: sources.length }, null, 2) + '\n');

const existing = existsSync(outDir) ? walk(outDir).map((file) => toPosix(relative(outDir, file))) : [];

if (check) {
  const problems = [];
  for (const [target, content] of expected) {
    const file = join(outDir, target);
    if (!existsSync(file)) problems.push(`missing ${target}`);
    else if (lf(readFileSync(file, 'utf8')) !== content) problems.push(`differs ${target}`);
  }
  for (const target of existing) {
    if (!expected.has(target)) problems.push(`extra ${target}`);
  }
  if (problems.length) {
    console.error(`sync-engine --check: src/app/engine is out of date with pocket-legions-api@${commit}`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('Run `npm run sync:engine`. Rule changes belong in pocket-legions-api, not here.');
    process.exit(1);
  }
  console.log(`sync-engine --check: OK (${sources.length} files, pocket-legions-api@${commit}, data ${dataVersion})`);
  process.exit(0);
}

for (const target of existing) {
  if (!expected.has(target)) rmSync(join(outDir, target));
}
for (const [target, content] of expected) {
  const file = join(outDir, target);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
console.log(`sync-engine: copied ${sources.length} files from pocket-legions-api@${commit} (data ${dataVersion})`);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function lf(text) {
  return text.replace(/\r\n/g, '\n');
}

function globToRegExp(glob) {
  return new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
}

/** The last commit that touched the synced set, so unrelated API commits don't change the header. */
function sourceCommit(paths) {
  const git = (...args) => execFileSync('git', ['-C', apiDir, ...args], { encoding: 'utf8' }).trim();
  try {
    const hash = git('log', '-1', '--format=%h', '--', ...paths);
    const dirty = git('status', '--porcelain', '--', ...paths) !== '';
    return dirty ? `${hash}+dirty` : hash;
  } catch {
    return 'unknown';
  }
}
