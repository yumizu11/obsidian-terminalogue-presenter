import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Collects the release, and checks that it is the release it claims to be.
 *
 *   node scripts/release.mjs
 *
 * Nothing here publishes: it writes into `dist-release/`, prints the commands to
 * run, and stops. Making a release is a deliberate, manual step.
 *
 * Obsidian's community directory reads `manifest.json` at the HEAD of this
 * repository's default branch to find the current version, then downloads
 * `main.js` and `manifest.json` from the GitHub release tagged exactly that
 * version — the bare number, never `v0.5.2`. `versions.json` maps each
 * published version to the Obsidian version it needs, so an older app can still
 * find a release it can run.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** `owner/name` of the GitHub repository the release is created in. */
const REPO = 'yumizu11/obsidian-terminalogue-presenter';

const OUT = resolve(root, 'dist-release');

/**
 * What Obsidian downloads. This plugin has no `styles.css`: it adds no styling
 * of its own, which is also why it needs none — the settings tab uses
 * Obsidian's own classes.
 */
const ASSETS = ['main.js', 'manifest.json'];

/** Sources whose age decides whether the built plugin is stale. */
const SOURCE_DIRS = [resolve(root, 'src'), resolve(root, 'vendor')];

const problems = [];
const fail = (message) => problems.push(message);

const manifest = readJson(resolve(root, 'manifest.json'));
const { version, minAppVersion } = manifest;

const versions = readJson(resolve(root, 'versions.json'));
if (versions[version] !== minAppVersion) {
  fail(`versions.json has no "${version}": "${minAppVersion}" entry. Add one.`);
}

const packageVersion = readJson(resolve(root, 'package.json')).version;
if (packageVersion !== version) {
  fail(`package.json is ${packageVersion} but manifest.json says ${version}. Bump them together.`);
}

if (!exists(resolve(root, 'main.js'))) {
  fail('Missing main.js. Run "npm run build" first.');
} else {
  // A stale bundle is the one mistake that reaches users looking like a good
  // release, so the build must be newer than everything it was built from —
  // the vendored engine included.
  const built = statSync(resolve(root, 'main.js')).mtimeMs;
  const newest = SOURCE_DIRS.filter(exists)
    .flatMap(walk)
    .reduce((latest, file) => Math.max(latest, statSync(file).mtimeMs), 0);
  if (newest > built) {
    fail('main.js is older than its sources. Run "npm run build" first.');
  }
}

if (problems.length > 0) {
  console.error('\n[release] this is not a releasable state:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const asset of ASSETS) copyFileSync(resolve(root, asset), resolve(OUT, asset));

console.log(`\n[release] ${manifest.name} ${version} collected into ${relative(root, OUT)}\n`);
for (const asset of ASSETS) {
  console.log(`    ${asset.padEnd(14)} ${statSync(resolve(OUT, asset)).size} bytes`);
}

const assetPaths = ASSETS.map((asset) => `dist-release/${asset}`).join(' ');

console.log('\nNext, by hand — none of it done for you:\n');
console.log(`  1. ${REPO} must be public, with this manifest committed to its default`);
console.log('     branch: the directory reads the manifest from HEAD, not from the release.');
console.log('  2. Create the release. The tag must be the bare version, with no "v":\n');
console.log(
  `       gh release create ${version} ${assetPaths} --repo ${REPO} ` +
    `--title "${manifest.name} ${version}"\n`,
);
console.log('  3. Submit at community.obsidian.md — sign in, connect GitHub, claim');
console.log(`     ${REPO}, then Plugins > New plugin. Only the first`);
console.log('     release is submitted; later ones are found from the manifest and the tag.\n');
console.log('  Review feedback is answered with a new release at a higher version,');
console.log('  never by moving a tag.\n');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(dir) {
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}
