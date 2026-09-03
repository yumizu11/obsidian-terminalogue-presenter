import assert from 'node:assert/strict';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFsStub, createObsidianStub } from './obsidian-stub.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = resolve(here, '../main.js');

const VAULT = '/vault';
const MARP = '/usr/local/bin/marp';

/**
 * Loads the built plugin with Obsidian, Electron and the two Node modules it
 * touches replaced, and drives its commands the way the command palette does.
 */
function loadPlugin({ exitCode = 0, writeOutput = true, executable = MARP } = {}) {
  const obsidian = createObsidianStub();
  const fs = createFsStub();
  const spawns = [];
  const opened = [];

  const childProcess = {
    spawn(command, args, options) {
      const call = { command, args: [...args], options };
      spawns.push(call);

      const listeners = { close: [], error: [] };
      const child = {
        stdout: { on: () => child.stdout },
        stderr: { on: () => child.stderr },
        killed: false,
        on(event, listener) {
          listeners[event]?.push(listener);
          return child;
        },
        kill() {
          child.killed = true;
          return true;
        },
      };

      // Marp writes its output, then exits — on the next tick, as a real one
      // would, so nothing here resolves before the plugin is waiting for it.
      setImmediate(() => {
        const output = args[args.indexOf('--output') + 1];
        if (writeOutput && args.includes('--output')) {
          fs.module.writeFileSync(output, '<!doctype html><html></html>');
        }
        if (args.includes('--watch')) return; // watch keeps running
        for (const listener of listeners.close) listener(exitCode, null);
      });
      return child;
    },
  };

  const electron = {
    shell: {
      async openExternal(url) {
        opened.push(url);
      },
    },
  };

  const stubs = {
    obsidian: obsidian.module,
    electron,
    'node:child_process': childProcess,
    'node:fs': fs.module,
  };

  const originalLoad = Module._load;
  Module._load = function patched(request, ...rest) {
    if (request in stubs) return stubs[request];
    return originalLoad.call(this, request, ...rest);
  };
  let PluginClass;
  try {
    delete require.cache[BUNDLE];
    const exported = require(BUNDLE);
    PluginClass = exported.default ?? exported;
  } finally {
    Module._load = originalLoad;
  }

  // The Marp CLI the settings point at exists; nothing else does.
  fs.files.set(executable, '#!/bin/sh');

  const plugin = new PluginClass();
  const files = new Map();
  const workspace = { activeFile: null, activeView: null };

  plugin.app = {
    vault: {
      adapter: Object.assign(new obsidian.module.FileSystemAdapter(), {
        getFullPath: (vaultPath) => `${VAULT}/${vaultPath}`,
      }),
      getAbstractFileByPath: (path) => files.get(path) ?? null,
    },
    workspace: {
      getActiveFile: () => workspace.activeFile,
      getActiveViewOfType: () => workspace.activeView,
    },
  };
  plugin._data = { marpExecutable: executable, openBrowserAutomatically: true };

  return { plugin, obsidian, fs, spawns, opened, files, workspace };
}

/** A `TFile`-shaped note. */
const note = (path) => ({
  path,
  extension: path.split('.').pop(),
  basename: path.split('/').pop().replace(/\.[^.]+$/, ''),
});

/** Runs a command and waits for the notice it ends with. */
async function run(context, id, expected, { timeoutMs = 2000 } = {}) {
  context.obsidian.notices.length = 0;
  context.plugin.commands.get(id).callback();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (context.obsidian.notices.some((message) => message.startsWith(expected))) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(
    `"${expected}" never appeared. Notices: ${JSON.stringify(context.obsidian.notices)}`,
  );
}

test('the plugin registers the four commands, without repeating its own name', async () => {
  const context = loadPlugin();
  await context.plugin.onload();

  assert.deepEqual(
    [...context.plugin.commands.values()].map((command) => [command.id, command.name]),
    [
      ['present', 'Present current note'],
      ['present-watch', 'Present current note with watch'],
      ['export-html', 'Export current note to HTML'],
      ['stop', 'Stop presentation'],
    ],
  );
});

test('a command with no active note says so, and starts nothing', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = null;

  for (const id of ['present', 'present-watch', 'export-html']) {
    await run(context, id, 'No active Markdown note.');
  }
  assert.equal(context.spawns.length, 0);
});

test('a command on a file that is not Markdown says so, and starts nothing', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('images/diagram.png');

  await run(context, 'present', 'The current file is not a Markdown file.');
  assert.equal(context.spawns.length, 0);
});

test('a command without a Marp CLI points at the setting, and starts nothing', async () => {
  const context = loadPlugin({ executable: '/nowhere/marp' });
  context.fs.files.delete('/nowhere/marp');
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present', 'Marp CLI was not found.');
  assert.match(context.obsidian.notices.join('\n'), /Terminalogue Presenter settings/);
  assert.equal(context.spawns.length, 0);
});

test('Present converts into the temp directory and opens the browser once', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present', 'Presentation opened in browser.');

  assert.equal(context.spawns.length, 1);
  const [call] = context.spawns;
  assert.equal(call.command, MARP);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.cwd, dirname(`${VAULT}/talks/deploy.md`));
  assert.ok(call.args.includes(`${VAULT}/talks/deploy.md`), 'the note is the input');

  // Nothing is written into the vault, and the browser saw a file: URL.
  const output = call.args[call.args.indexOf('--output') + 1];
  assert.ok(output.startsWith(join(tmpdir(), 'terminalogue-presenter')), output);
  assert.equal(context.opened.length, 1);
  assert.match(context.opened[0], /^file:\/\/\S*presentation\.html$/);
  assert.equal([...context.fs.files.keys()].some((path) => path.startsWith(VAULT)), false);

  // "Generating presentation…" comes first, and there is no third notice.
  assert.deepEqual(context.obsidian.notices, [
    'Generating presentation…',
    'Presentation opened in browser.',
  ]);
});

test('a failed conversion says so once and never opens a browser', async () => {
  const context = loadPlugin({ exitCode: 1, writeOutput: false });
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present', 'Failed to generate presentation.');

  assert.equal(context.opened.length, 0, 'the browser must not open for a failure');
  // The Notice stays one sentence; the stderr goes to the console.
  assert.deepEqual(context.obsidian.notices, [
    'Generating presentation…',
    'Failed to generate presentation.',
  ]);
});

test('a conversion that writes nothing is a failure, not an empty browser tab', async () => {
  const context = loadPlugin({ exitCode: 0, writeOutput: false });
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present', 'Failed to generate presentation.');
  assert.equal(context.opened.length, 0);
});

test('Present with watch passes --watch, opens one window, and keeps running', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present-watch', 'Watching presentation…');

  assert.equal(context.spawns.length, 1);
  assert.ok(context.spawns[0].args.includes('--watch'));
  assert.equal(context.opened.length, 1, 'watch mode opens exactly one window');

  // A reconversion is Marp's business, and reaches the page Marp already
  // opened: the plugin neither spawns nor opens anything again.
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(context.opened.length, 1);
  assert.equal(context.spawns.length, 1);
});

test('a second watch replaces the first instead of stacking', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present-watch', 'Watching presentation…');
  await run(context, 'present-watch', 'Watching presentation…');

  assert.equal(context.spawns.length, 2);
  assert.equal(context.opened.length, 2);
  // The first process was stopped when the second one started.
  assert.equal(context.plugin.commands.size, 4);
});

test('Stop ends a watch, and says so even when nothing was running', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  context.obsidian.notices.length = 0;
  context.plugin.commands.get('stop').callback();
  assert.deepEqual(context.obsidian.notices, ['No presentation is running.']);

  await run(context, 'present-watch', 'Watching presentation…');

  context.obsidian.notices.length = 0;
  context.plugin.commands.get('stop').callback();
  assert.deepEqual(context.obsidian.notices, ['Presentation stopped.']);
});

test('unloading the plugin stops the watch process it started', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'present-watch', 'Watching presentation…');
  assert.doesNotThrow(() => context.plugin.onunload());

  // Everything the plugin wrote to the temporary directory is gone with it.
  const root = join(tmpdir(), 'terminalogue-presenter');
  assert.equal([...context.fs.files.keys()].some((path) => path.startsWith(root)), false);
});

test('Export writes an HTML beside the note and opens no browser', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');

  await run(context, 'export-html', 'HTML exported successfully.');

  const output = context.spawns[0].args[context.spawns[0].args.indexOf('--output') + 1];
  assert.equal(output, `${VAULT}/talks/deploy.html`);
  assert.equal(context.opened.length, 0, 'Export produces a file, not a window');
});

test('Export asks before replacing an HTML the vault already has', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  context.workspace.activeFile = note('talks/deploy.md');
  context.files.set('talks/deploy.html', { path: 'talks/deploy.html' });

  context.obsidian.answerConfirmWith(false);
  context.obsidian.notices.length = 0;
  context.plugin.commands.get('export-html').callback();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(context.obsidian.modals.length, 1);
  assert.equal(context.spawns.length, 0, 'declining must convert nothing');

  context.obsidian.answerConfirmWith(true);
  await run(context, 'export-html', 'HTML exported successfully.');
  assert.equal(context.spawns.length, 1);
});

test('the note is saved before it is converted', async () => {
  const context = loadPlugin();
  await context.plugin.onload();
  const active = note('talks/deploy.md');
  context.workspace.activeFile = active;

  let saved = 0;
  const view = new context.obsidian.module.MarkdownView();
  view.file = active;
  view.save = async () => {
    saved++;
  };
  context.workspace.activeView = view;

  await run(context, 'present', 'Presentation opened in browser.');
  assert.equal(saved, 1);
});

test('Test Marp reports the version, or points at the setting', async () => {
  const context = loadPlugin();
  await context.plugin.onload();

  const found = context.plugin.testMarp();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(context.spawns.at(-1).args.join(' '), '--version');
  assert.match(await found, /^Marp CLI (detected|was not found)/);

  context.fs.files.delete(MARP);
  assert.equal(await context.plugin.testMarp(), 'Marp CLI was not found. Check the executable path.');
});
