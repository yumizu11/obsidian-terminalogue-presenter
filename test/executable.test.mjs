import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internals } from './helpers.mjs';

const { resolveExecutable, findOnPath, DEFAULT_EXECUTABLE_NAME } = internals;

/** A lookup environment backed by a list of files that "exist". */
function environment(platform, path, files, pathExt) {
  const windows = platform === 'win32';
  // Windows file names are case insensitive, and PATHEXT is upper case, so a
  // lookup for `marp.CMD` has to find `marp.cmd`.
  const key = (value) => (windows ? value.toLowerCase() : value);
  const present = new Set(files.map(key));
  return {
    platform,
    path,
    ...(pathExt === undefined ? {} : { pathExt }),
    isFile: (candidate) => present.has(key(candidate)),
    join: (directory, name) => `${directory}${windows ? '\\' : '/'}${name}`,
    isPathLike: (value) => value.includes('/') || value.includes('\\'),
  };
}

test('an empty setting looks for marp on PATH', () => {
  const env = environment('linux', '/usr/bin:/usr/local/bin', ['/usr/local/bin/marp']);

  assert.equal(resolveExecutable('', env), '/usr/local/bin/marp');
  assert.equal(resolveExecutable('   ', env), '/usr/local/bin/marp');
  assert.equal(DEFAULT_EXECUTABLE_NAME, 'marp');
});

test('PATH order decides, and a missing marp is null rather than a guess', () => {
  const both = environment('linux', '/a:/b', ['/a/marp', '/b/marp']);
  assert.equal(resolveExecutable('', both), '/a/marp');

  assert.equal(resolveExecutable('', environment('linux', '/a:/b', [])), null);
  assert.equal(resolveExecutable('', environment('linux', undefined, [])), null);
});

test('on Windows the launcher an npm install writes is found, and named in full', () => {
  const env = environment(
    'win32',
    'C:\\Windows;C:\\Users\\me\\AppData\\Roaming\\npm',
    ['C:\\Users\\me\\AppData\\Roaming\\npm\\marp.cmd'],
    '.COM;.EXE;.BAT;.CMD',
  );

  // The full name matters: it is what tells the spawn side it needs cmd.exe.
  assert.equal(resolveExecutable('', env), 'C:\\Users\\me\\AppData\\Roaming\\npm\\marp.cmd');
});

test('a standalone marp.exe wins over nothing, and PATHEXT order is honoured', () => {
  const env = environment(
    'win32',
    'C:\\Tools',
    ['C:\\Tools\\marp.exe', 'C:\\Tools\\marp.cmd'],
    '.COM;.EXE;.BAT;.CMD',
  );
  assert.equal(resolveExecutable('', env), 'C:\\Tools\\marp.exe');
});

test('Windows falls back to the default PATHEXT when the variable is missing', () => {
  const env = environment('win32', 'C:\\Tools', ['C:\\Tools\\marp.cmd']);
  assert.equal(resolveExecutable('', env), 'C:\\Tools\\marp.cmd');
});

test('quoted and blank PATH entries do not derail the lookup', () => {
  const env = environment('win32', '"C:\\Tools";;  ;C:\\Other', ['C:\\Other\\marp.exe'], '.EXE');
  assert.equal(findOnPath('marp', env), 'C:\\Other\\marp.exe');
});

test('a configured path is used as it is, and only when it exists', () => {
  const files = ['/opt/marp/bin/marp'];
  const env = environment('linux', '/usr/bin', files);

  assert.equal(resolveExecutable('/opt/marp/bin/marp', env), '/opt/marp/bin/marp');
  assert.equal(resolveExecutable('/opt/marp/bin/missing', env), null);
});

test('a configured bare command is still looked up on PATH', () => {
  const env = environment('linux', '/usr/bin:/opt/bin', ['/opt/bin/marp-next']);

  assert.equal(resolveExecutable('marp-next', env), '/opt/bin/marp-next');
  assert.equal(resolveExecutable('marp-missing', env), null);
});

test('nothing hard-codes an installation directory', () => {
  // With an empty PATH there is nowhere to look, so there is no answer — the
  // reader is asked for the path instead of being guessed at.
  for (const platform of ['linux', 'darwin', 'win32']) {
    assert.equal(resolveExecutable('', environment(platform, '', [])), null);
  }
});
