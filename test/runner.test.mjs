import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internals, recordingSpawn } from './helpers.mjs';

const { MarpRunner, buildMarpArguments } = internals;

const REQUEST = {
  input: '/vault/talks/deploy.md',
  output: '/tmp/terminalogue-presenter/session-a-b/presentation.html',
  engine: '/tmp/terminalogue-presenter/session-a-b/terminalogue-marp-engine.mjs',
  cwd: '/vault/talks',
};

test('a conversion asks Marp for one HTML with the Terminalogue engine', () => {
  assert.deepEqual(buildMarpArguments(REQUEST), [
    '--engine',
    REQUEST.engine,
    '--output',
    REQUEST.output,
    REQUEST.input,
  ]);
});

test('watch mode adds --watch and nothing else', () => {
  assert.deepEqual(buildMarpArguments({ ...REQUEST, watch: true }), [
    '--engine',
    REQUEST.engine,
    '--output',
    REQUEST.output,
    '--watch',
    REQUEST.input,
  ]);
});

test('nothing overrides the deck: no theme, no paginate, no html flag', () => {
  const args = buildMarpArguments({ ...REQUEST, watch: true }).join(' ');

  for (const imposed of ['--theme', '--paginate', '--html', '--template', '--no-config']) {
    assert.ok(!args.includes(imposed), `Terminalogue Presenter must not pass ${imposed}`);
  }
});

test('the process is started without a shell, in the note’s own folder', async () => {
  const { spawn, calls } = recordingSpawn({ code: 0 });
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const run = runner.run('/usr/local/bin/marp', REQUEST);
  const [call] = calls;

  assert.equal(call.command, '/usr/local/bin/marp');
  assert.deepEqual(call.args, buildMarpArguments(REQUEST));
  assert.equal(call.options.shell, false);
  assert.equal(call.options.cwd, '/vault/talks');
  assert.equal(call.options.windowsVerbatimArguments, undefined);
  // Nothing is ever fed to Marp: an unread stdin pipe is a process that waits.
  assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe']);

  run.stop();
  await run.done;
});

test('a Windows launcher is spawned verbatim through cmd.exe', () => {
  const { spawn, calls } = recordingSpawn({ code: 0 });
  const runner = new MarpRunner({
    spawn,
    environment: { platform: 'win32', comSpec: 'C:\\WINDOWS\\system32\\cmd.exe' },
  });

  runner.run('C:\\npm\\marp.cmd', REQUEST);

  assert.equal(calls[0].command, 'C:\\WINDOWS\\system32\\cmd.exe');
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsVerbatimArguments, true);
  assert.equal(calls[0].args[0], '/d');
});

test('exit code 0 succeeds and anything else does not', async () => {
  for (const [code, ok] of [
    [0, true],
    [1, false],
    [2, false],
    [null, false],
  ]) {
    const { spawn, processes } = recordingSpawn();
    const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });
    const run = runner.run('marp', REQUEST);
    processes[0].close(code, null);

    const result = await run.done;
    assert.equal(result.ok, ok, `exit code ${code}`);
    assert.equal(result.code, code);
  }
});

test('stdout and stderr are collected for the log, not thrown away', async () => {
  const { spawn, processes } = recordingSpawn({ stdout: 'converting…', stderr: 'a warning' });
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const run = runner.run('marp', REQUEST);
  processes[0].close(0, null);
  const result = await run.done;

  assert.equal(result.stdout, 'converting…');
  assert.equal(result.stderr, 'a warning');
});

test('a process that cannot start is a failure, not a running process', async () => {
  const { spawn } = recordingSpawn({ throws: new Error('spawn ENOENT') });
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const run = runner.run('marp', REQUEST);
  const result = await run.done;

  assert.equal(result.ok, false);
  assert.equal(result.error.message, 'spawn ENOENT');
  assert.equal(run.running, false);
});

test('an error event after the spawn also settles the run', async () => {
  const { spawn, processes } = recordingSpawn();
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const run = runner.run('marp', REQUEST);
  processes[0].fail(new Error('EACCES'));
  const result = await run.done;

  assert.equal(result.ok, false);
  assert.equal(result.error.message, 'EACCES');
  assert.equal(run.running, false);
});

test('stopping a finished run is a no-op rather than an error', async () => {
  const { spawn, processes } = recordingSpawn();
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const run = runner.run('marp', REQUEST);
  processes[0].close(0, null);
  await run.done;

  assert.doesNotThrow(() => run.stop());
  assert.equal(processes[0].killed, false, 'a finished process is not killed again');
});

test('marp --version is read out of the output', async () => {
  const { spawn, calls, processes } = recordingSpawn({
    stdout: '@marp-team/marp-cli v4.2.1 (w/ @marp-team/marp-core v4.0.1)\n',
  });
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const version = runner.version('/usr/local/bin/marp', '/tmp');
  processes[0].close(0, null);

  assert.deepEqual(calls[0].args, ['--version']);
  assert.equal(await version, 'v4.2.1');
});

test('a failing marp --version reports nothing rather than a wrong version', async () => {
  const { spawn, processes } = recordingSpawn({ stderr: 'command not found' });
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });

  const version = runner.version('marp', '/tmp');
  processes[0].close(127, null);

  assert.equal(await version, null);
});
