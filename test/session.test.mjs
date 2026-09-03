import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internals, memoryFileSystem, posixJoin } from './helpers.mjs';

const { PresenterWorkspace, WORKSPACE_DIRECTORY, PRESENTATION_HTML, ENGINE_MODULE } = internals;

const TEMP = '/var/folders/tmp';
const ROOT = `${TEMP}/${WORKSPACE_DIRECTORY}`;

function workspace({ now = () => 1_700_000_000_000, random = () => 0.5 } = {}) {
  const memory = memoryFileSystem();
  const instance = new PresenterWorkspace({
    fs: memory.fs,
    temporaryDirectory: TEMP,
    join: posixJoin,
    engineSource: '// engine',
    now,
    random,
  });
  return { instance, memory };
}

test('Present converts inside one directory of its own under the temp directory', () => {
  const { instance, memory } = workspace();

  const session = instance.createSession();

  assert.equal(instance.root, ROOT);
  assert.match(session.id, /^session-[0-9a-z]+-[0-9a-z]+$/);
  assert.equal(session.directory, `${ROOT}/${session.id}`);
  assert.equal(session.htmlPath, `${ROOT}/${session.id}/${PRESENTATION_HTML}`);
  assert.equal(session.enginePath, `${ROOT}/${session.id}/${ENGINE_MODULE}`);
  assert.equal(memory.files.get(session.enginePath), '// engine');
});

test('nothing Present writes lands in the vault', () => {
  const { instance, memory } = workspace();
  instance.createSession();

  // Every file the workspace writes is inside its own directory under the
  // operating system's temporary directory, and nowhere else.
  assert.ok(memory.files.size > 0);
  for (const path of memory.files.keys()) {
    assert.ok(path.startsWith(`${ROOT}/`), `${path} must live under ${ROOT}`);
  }
});

test('every session gets its own directory', () => {
  let tick = 0;
  const { instance } = workspace({ now: () => 1_700_000_000_000 + tick++ });

  const first = instance.createSession();
  const second = instance.createSession();

  assert.notEqual(first.directory, second.directory);
});

test('stale sessions are swept, and fresh ones from another window are not', () => {
  const now = 1_700_000_000_000;
  const { instance, memory } = workspace({ now: () => now });

  memory.fs.makeDirectory(`${ROOT}/session-old-1`);
  memory.directories.set(`${ROOT}/session-old-1`, now - 7 * 60 * 60 * 1000);
  memory.fs.makeDirectory(`${ROOT}/session-new-2`);
  memory.directories.set(`${ROOT}/session-new-2`, now - 60 * 1000);

  instance.cleanupStale();

  assert.equal(memory.fs.isDirectory(`${ROOT}/session-old-1`), false);
  assert.equal(memory.fs.isDirectory(`${ROOT}/session-new-2`), true);
});

test('cleanup only ever removes directories it could have created', () => {
  const now = 1_700_000_000_000;
  const { instance, memory } = workspace({ now: () => now });

  // Someone else's data, sitting in the same place, from long ago.
  for (const name of ['important-backup', 'session', 'sessions', '..', 'session-a-b-c']) {
    memory.fs.makeDirectory(`${ROOT}/${name}`);
    memory.directories.set(`${ROOT}/${name}`, 0);
  }

  instance.cleanupStale();

  for (const name of ['important-backup', 'session', 'sessions', '..', 'session-a-b-c']) {
    assert.equal(memory.fs.isDirectory(`${ROOT}/${name}`), true, `${name} must survive`);
  }
});

test('the previous presentation is cleaned up, and the one still in use is kept', () => {
  let tick = 0;
  const { instance, memory } = workspace({ now: () => 1_700_000_000_000 + tick++ });

  const watched = instance.createSession();
  const previous = instance.createSession();
  const current = instance.createSession();

  instance.cleanupOwnExcept([current, watched]);

  assert.equal(memory.fs.isDirectory(previous.directory), false);
  assert.equal(memory.fs.isDirectory(current.directory), true);
  assert.equal(memory.fs.isDirectory(watched.directory), true);
});

test('unloading removes every session this plugin created', () => {
  let tick = 0;
  const { instance, memory } = workspace({ now: () => 1_700_000_000_000 + tick++ });
  const sessions = [instance.createSession(), instance.createSession()];

  instance.dispose();

  for (const session of sessions) {
    assert.equal(memory.fs.isDirectory(session.directory), false);
  }
  // And the directory the plugin owns is not itself removed, so a second
  // Obsidian window's sessions are untouched.
  assert.equal(memory.fs.isDirectory(ROOT), true);
});

test('a directory that refuses to go is logged, not thrown', () => {
  const memory = memoryFileSystem();
  const logged = [];
  const instance = new PresenterWorkspace({
    fs: {
      ...memory.fs,
      removeDirectory() {
        throw new Error('EBUSY');
      },
    },
    temporaryDirectory: TEMP,
    join: posixJoin,
    engineSource: '// engine',
    log: (message) => logged.push(message),
  });

  instance.createSession();
  assert.doesNotThrow(() => instance.dispose());
  assert.equal(logged.length, 1);
});
