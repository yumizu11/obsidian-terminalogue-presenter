import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** The built bundle, so the tests exercise the code that actually ships. */
export const internals = require(resolve(here, '../dist/internals.cjs'));

/** A `spawn` stand-in that records every call and hands back a fake process. */
export function recordingSpawn({ code = 0, stdout = '', stderr = '', throws = null } = {}) {
  const calls = [];
  const processes = [];

  const spawn = (command, args, options) => {
    calls.push({ command, args: [...args], options });
    if (throws) throw throws;

    const listeners = { error: [], close: [] };
    const child = {
      stdout: stream(stdout),
      stderr: stream(stderr),
      killed: false,
      on(event, listener) {
        listeners[event]?.push(listener);
        return child;
      },
      kill() {
        child.killed = true;
        child.close(null, 'SIGTERM');
        return true;
      },
      /** Ends the fake process, the way a real one ends. */
      close(exitCode = code, signal = null) {
        for (const listener of listeners.close.splice(0)) listener(exitCode, signal);
      },
      fail(error) {
        for (const listener of listeners.error.splice(0)) listener(error);
      },
    };
    processes.push(child);
    return child;
  };

  return { spawn, calls, processes };
}

/** A readable-ish stream that replays one chunk on the next tick. */
function stream(text) {
  return {
    on(event, listener) {
      if (event === 'data' && text !== '') listener(text);
      return this;
    },
  };
}

/** A process that never exits on its own, for watch-mode tests. */
export function pendingSpawn() {
  return recordingSpawn({ code: null });
}

/** An in-memory `WorkspaceFileSystem`. */
export function memoryFileSystem() {
  const directories = new Map(); // path -> mtime
  const files = new Map(); // path -> contents

  return {
    directories,
    files,
    fs: {
      makeDirectory(path) {
        // mkdirSync(..., { recursive: true }): every missing parent too.
        const segments = path.split('/');
        for (let depth = 1; depth <= segments.length; depth++) {
          const parent = segments.slice(0, depth).join('/');
          if (parent !== '') directories.set(parent, directories.get(parent) ?? 0);
        }
      },
      writeFile(path, contents) {
        files.set(path, contents);
      },
      listDirectory(path) {
        const prefix = `${path}/`;
        const names = new Set();
        for (const directory of directories.keys()) {
          if (directory.startsWith(prefix)) names.add(directory.slice(prefix.length).split('/')[0]);
        }
        return [...names];
      },
      isDirectory(path) {
        return directories.has(path);
      },
      modifiedAt(path) {
        return directories.has(path) ? (directories.get(path) ?? 0) : null;
      },
      removeDirectory(path) {
        for (const directory of [...directories.keys()]) {
          if (directory === path || directory.startsWith(`${path}/`)) directories.delete(directory);
        }
        for (const file of [...files.keys()]) {
          if (file.startsWith(`${path}/`)) files.delete(file);
        }
      },
    },
  };
}

/** POSIX-style `join`, so workspace tests read the same on every platform. */
export const posixJoin = (...segments) => segments.join('/');
