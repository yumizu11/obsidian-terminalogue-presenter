import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internals, recordingSpawn } from './helpers.mjs';

const { MarpProcessManager, MarpRunner } = internals;

const REQUEST = {
  input: '/vault/deploy.md',
  output: '/tmp/terminalogue-presenter/s1/presentation.html',
  engine: '/tmp/terminalogue-presenter/s1/terminalogue-marp-engine.mjs',
  cwd: '/vault',
};

/** A manager over a fake Marp, with the output file under the test's control. */
function harness({ outputs = new Set() } = {}) {
  const { spawn, calls, processes } = recordingSpawn();
  const runner = new MarpRunner({ spawn, environment: { platform: 'linux' } });
  const manager = new MarpProcessManager({
    runner,
    hasOutput: (path) => outputs.has(path),
    // No real time: every poll resolves on the microtask queue.
    delay: () => Promise.resolve(),
    watchTimeoutMs: 50,
    pollIntervalMs: 10,
  });
  return { manager, calls, processes, outputs };
}

test('a conversion succeeds when Marp exits cleanly and wrote the file', async () => {
  const { manager, processes, outputs } = harness();
  outputs.add(REQUEST.output);

  const outcome = manager.convert('marp', REQUEST);
  processes[0].close(0, null);

  assert.deepEqual(await outcome, { ok: true, message: 'Presentation generated.' });
});

test('a non-zero exit is one short message, with the detail kept for the log', async () => {
  const { manager, processes } = harness();

  const outcome = manager.convert('marp', REQUEST);
  processes[0].close(1, null);
  const result = await outcome;

  assert.equal(result.ok, false);
  assert.equal(result.message, 'Failed to generate presentation.');
  assert.match(result.detail, /exited with code 1/);
});

test('a clean exit that wrote nothing is still a failure', async () => {
  const { manager, processes } = harness();

  const outcome = manager.convert('marp', REQUEST);
  processes[0].close(0, null);
  const result = await outcome;

  assert.equal(result.ok, false);
  assert.match(result.detail, /wrote nothing/);
});

test('watch mode resolves once the first HTML exists, and keeps running', async () => {
  const { manager, calls, outputs } = harness();

  const started = manager.startWatch('marp', REQUEST);
  outputs.add(REQUEST.output);
  const outcome = await started;

  assert.equal(outcome.ok, true);
  assert.ok(calls[0].args.includes('--watch'));
  assert.equal(manager.isWatching, true);
  assert.equal(manager.watchedNote, REQUEST.input);
});

test('watch mode fails when Marp exits before writing anything', async () => {
  const { manager, processes } = harness();

  const started = manager.startWatch('marp', REQUEST);
  processes[0].close(1, null);
  const outcome = await started;

  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, 'Failed to generate presentation.');
  assert.equal(manager.isWatching, false, 'a failed process is not a running one');
});

test('watch mode gives up rather than waiting forever', async () => {
  const { manager, processes } = harness();

  const outcome = await manager.startWatch('marp', REQUEST);

  assert.equal(outcome.ok, false);
  assert.match(outcome.detail, /no output within/);
  assert.equal(manager.isWatching, false);
  assert.equal(processes[0].killed, true, 'the stalled process is stopped');
});

test('a second watch replaces the first, for the same note or another', async () => {
  for (const secondInput of [REQUEST.input, '/vault/other.md']) {
    const { manager, calls, processes, outputs } = harness();

    const first = manager.startWatch('marp', REQUEST);
    outputs.add(REQUEST.output);
    await first;

    const second = manager.startWatch('marp', { ...REQUEST, input: secondInput });
    outputs.add(REQUEST.output);
    await second;

    assert.equal(calls.length, 2, 'exactly one watch process is started per request');
    assert.equal(processes[0].killed, true, 'the previous watch is stopped');
    assert.equal(manager.isWatching, true);
    assert.equal(manager.watchedNote, secondInput);
  }
});

test('Stop ends the watch and says so; a second Stop says nothing was running', async () => {
  const { manager, processes, outputs } = harness();

  const started = manager.startWatch('marp', REQUEST);
  outputs.add(REQUEST.output);
  await started;

  assert.equal(manager.stop(), true);
  assert.equal(processes[0].killed, true);
  assert.equal(manager.isWatching, false);

  // Stopping nothing is not an error.
  assert.equal(manager.stop(), false);
  assert.doesNotThrow(() => manager.stop());
});

test('Stop with nothing running is safe from the very beginning', () => {
  const { manager } = harness();
  assert.equal(manager.stop(), false);
});

test('a watch process that ends on its own clears the bookkeeping', async () => {
  const { manager, processes, outputs } = harness();

  const started = manager.startWatch('marp', REQUEST);
  outputs.add(REQUEST.output);
  await started;
  assert.equal(manager.isWatching, true);

  processes[0].close(0, null);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(manager.isWatching, false);
});

test('unloading the plugin stops every process and starts no more', async () => {
  const { manager, processes, outputs, calls } = harness();

  const started = manager.startWatch('marp', REQUEST);
  outputs.add(REQUEST.output);
  await started;

  manager.dispose();

  assert.equal(processes[0].killed, true);
  assert.equal(manager.isWatching, false);

  const after = await manager.convert('marp', REQUEST);
  assert.equal(after.ok, false);
  assert.equal(calls.length, 1, 'nothing is spawned after dispose');
});

test('a one-shot conversion is stopped by Stop too', async () => {
  const { manager, processes } = harness();

  const pending = manager.convert('marp', REQUEST);
  assert.equal(manager.stop(), true);
  assert.equal(processes[0].killed, true);

  const outcome = await pending;
  assert.equal(outcome.ok, false);
});
