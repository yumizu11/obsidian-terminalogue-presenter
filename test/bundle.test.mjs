import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const BUNDLE = readFileSync(resolve(root, 'main.js'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

test('the Presenter is a separate, desktop-only plugin', () => {
  // It is desktop only because it runs Marp CLI as a program, which the mobile
  // app cannot do. Terminalogue itself — the plugin that renders `termlogue`
  // blocks in Reading View — is a different plugin, in its own repository, and
  // stays available on mobile.
  assert.equal(MANIFEST.id, 'terminalogue-presenter');
  assert.notEqual(MANIFEST.id, 'terminalogue');
  assert.equal(MANIFEST.isDesktopOnly, true);
  assert.ok(!MANIFEST.name.toLowerCase().includes('obsidian'));
});

test('the repository advertises this exact plugin to Obsidian', () => {
  // The community directory reads manifest.json at the HEAD of the default
  // branch to find the current version, and consults versions.json when the app
  // is older than minAppVersion. The release is then found by a tag equal to
  // the version, so package.json cannot disagree about what that version is.
  const versions = JSON.parse(readFileSync(resolve(root, 'versions.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

  assert.match(MANIFEST.version, /^\d+\.\d+\.\d+$/);
  assert.equal(versions[MANIFEST.version], MANIFEST.minAppVersion);
  assert.equal(pkg.version, MANIFEST.version);
});

test('the plugin carries the whole Terminalogue engine, needing no network', () => {
  // The engine is written to a scratch directory and passed to Marp CLI, so a
  // generated presentation animates with no node_modules and no internet.
  assert.match(BUNDLE, /terminalogue-block/);
  assert.match(BUNDLE, /--tlg-bg/);
  assert.match(BUNDLE, /bespoke-marp-active/);

  for (const network of ['XMLHttpRequest', 'WebSocket(', 'https://cdn', 'fetch("http']) {
    assert.ok(!BUNDLE.includes(network), `the plugin must not reference ${network}`);
  }
});

test('the only program the plugin can start is the configured Marp CLI', () => {
  // One import of child_process, and one spawn: the Marp CLI from the setting.
  assert.equal(BUNDLE.split('node:child_process').length - 1, 1);
  for (const forbidden of ['execSync(', 'execFileSync(', 'eval(', 'new Function']) {
    assert.ok(!BUNDLE.includes(forbidden), `the plugin must not use ${forbidden}`);
  }
  // A `termlogue` block stays text: nothing feeds block content to a process.
  assert.ok(!BUNDLE.includes('shell:!0'), 'no spawn may enable a shell');
  assert.ok(!BUNDLE.includes('shell: true'), 'no spawn may enable a shell');
});

test('the engine the plugin ships is the vendored one, byte for byte', () => {
  // The engine is the one thing this repository does not write itself: it is
  // the bundle @terminalogue/marp builds, vendored so the plugin builds on its
  // own. What ships has to be what is committed, or the presentation would
  // animate with something nobody reviewed.
  const vendored = readFileSync(resolve(root, 'vendor/terminalogue-marp-engine.mjs'), 'utf8');
  const embedded = require(resolve(root, 'dist/internals.cjs'));

  assert.ok(vendored.includes('terminalogue-block'));
  assert.ok(embedded.PresenterWorkspace, 'the internals bundle is what the tests exercise');
  // The generated constant holds that file verbatim.
  const generated = readFileSync(resolve(root, 'src/generated/engine-source.ts'), 'utf8');
  assert.equal(
    JSON.parse(generated.slice(generated.indexOf('= ') + 2).replace(/;\s*$/, '')),
    vendored,
  );
});
