import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internals } from './helpers.mjs';

const { buildSpawnTarget, UnsafeArgumentError } = internals;

/**
 * The security tests.
 *
 * A vault path is user content. It reaches Marp CLI as an argument, never as
 * part of a command string, and these tests pin that down for every platform —
 * including the one place Windows forces a command line to exist at all.
 */

/** Paths with every character a shell would treat as punctuation. */
const NASTY = [
  '/home/user/My Notes/deck.md',
  "/home/user/it's & done; $HOME/deck.md",
  '/home/user/a"quote"/deck.md',
  '/home/user/$(touch pwned)/deck.md',
  '/home/user/`touch pwned`/deck.md',
  '/home/user/a|b>c<d/deck.md',
  '/home/user/semi;colon/deck.md',
  '/home/user/new\tline/deck.md',
];

const POSIX = { platform: 'linux' };
const MACOS = { platform: 'darwin' };
const WINDOWS = { platform: 'win32', comSpec: 'C:\\WINDOWS\\system32\\cmd.exe' };

test('a POSIX executable is spawned with its arguments separated', () => {
  const target = buildSpawnTarget('/usr/local/bin/marp', ['--output', '/tmp/a b.html'], POSIX);

  assert.equal(target.command, '/usr/local/bin/marp');
  assert.deepEqual(target.args, ['--output', '/tmp/a b.html']);
  assert.equal(target.windowsVerbatimArguments, false);
});

test('no path is ever quoted, escaped or concatenated on POSIX', () => {
  for (const platform of [POSIX, MACOS]) {
    const target = buildSpawnTarget('/usr/local/bin/marp', NASTY, platform);

    // Every argument arrives byte for byte: there is no shell to protect from.
    assert.deepEqual(target.args, NASTY);
    assert.equal(target.command, '/usr/local/bin/marp');
  }
});

test('a Windows .exe is spawned directly too', () => {
  const target = buildSpawnTarget('C:\\Tools\\marp\\marp.exe', ['C:\\notes\\a b.md'], WINDOWS);

  assert.equal(target.command, 'C:\\Tools\\marp\\marp.exe');
  assert.deepEqual(target.args, ['C:\\notes\\a b.md']);
  assert.equal(target.windowsVerbatimArguments, false);
});

test('a Windows .cmd launcher goes through cmd.exe, quoted token by token', () => {
  const target = buildSpawnTarget(
    'C:\\Users\\me\\AppData\\Roaming\\npm\\marp.cmd',
    ['--output', 'C:\\out\\deck.html', 'C:\\notes\\deck.md'],
    WINDOWS,
  );

  assert.equal(target.command, 'C:\\WINDOWS\\system32\\cmd.exe');
  assert.equal(target.windowsVerbatimArguments, true);
  assert.deepEqual(target.args, [
    '/d',
    '/s',
    '/c',
    '""C:\\Users\\me\\AppData\\Roaming\\npm\\marp.cmd" "--output" "C:\\out\\deck.html" ' +
      '"C:\\notes\\deck.md""',
  ]);
});

test('a .bat launcher is treated the same way, whatever its case', () => {
  for (const executable of ['C:\\tools\\marp.BAT', 'C:\\tools\\marp.Cmd']) {
    const target = buildSpawnTarget(executable, ['deck.md'], WINDOWS);
    assert.equal(target.command, 'C:\\WINDOWS\\system32\\cmd.exe');
    assert.equal(target.windowsVerbatimArguments, true);
  }
});

test('cmd.exe metacharacters in a path stay inside their quotes', () => {
  const target = buildSpawnTarget(
    'C:\\tools\\marp.cmd',
    ['C:\\notes\\a & b\\deck.md', 'C:\\notes\\x|y>z\\deck.md', 'C:\\notes\\it;s $HOME\\deck.md'],
    WINDOWS,
  );
  const line = target.args[3];

  // Each argument is one quoted token: nothing can start a second command.
  assert.match(line, /"C:\\notes\\a & b\\deck\.md"/);
  assert.match(line, /"C:\\notes\\x\|y>z\\deck\.md"/);
  assert.match(line, /"C:\\notes\\it;s \$HOME\\deck\.md"/);
  // Quotes come in pairs: one to open the line, two per token, one to close.
  assert.equal((line.match(/"/g) ?? []).length, 2 + 2 * 4);
});

test('a path ending in a backslash cannot escape its closing quote', () => {
  const target = buildSpawnTarget('C:\\tools\\marp.cmd', ['C:\\a b\\', 'next'], WINDOWS);

  // `"C:\a b\"` would swallow the quote; `"C:\a b\\"` is one directory path.
  assert.match(target.args[3], /"C:\\a b\\\\" "next"/);
});

test('a path containing a double quote is refused rather than escaped', () => {
  assert.throws(
    () => buildSpawnTarget('C:\\tools\\marp.cmd', ['C:\\notes\\a"b.md'], WINDOWS),
    (error) => error instanceof UnsafeArgumentError && error.argument === 'C:\\notes\\a"b.md',
  );

  for (const nasty of ['a\rb', 'a\nb', 'a\0b']) {
    assert.throws(
      () => buildSpawnTarget('C:\\tools\\marp.cmd', [nasty], WINDOWS),
      UnsafeArgumentError,
    );
  }
});

test('the same path is harmless on POSIX, where there is no interpreter', () => {
  const target = buildSpawnTarget('/usr/bin/marp', ['/notes/a"b.md'], POSIX);
  assert.deepEqual(target.args, ['/notes/a"b.md']);
});

test('cmd.exe is found through ComSpec, and named explicitly without it', () => {
  assert.equal(
    buildSpawnTarget('m.cmd', [], { platform: 'win32', comSpec: 'D:\\cmd.exe' }).command,
    'D:\\cmd.exe',
  );
  assert.equal(buildSpawnTarget('m.cmd', [], { platform: 'win32' }).command, 'cmd.exe');
  assert.equal(
    buildSpawnTarget('m.cmd', [], { platform: 'win32', comSpec: '   ' }).command,
    'cmd.exe',
  );
});
