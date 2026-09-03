import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { ExecutableEnvironment } from './marp/executable.js';
import type { SpawnFn } from './marp/runner.js';
import type { WorkspaceFileSystem } from './marp/workspace.js';

/**
 * Everything the plugin needs from Node, in one place.
 *
 * The command, process and workspace modules take these as injected
 * dependencies rather than importing Node themselves, which is what makes them
 * testable — and what keeps `child_process` to exactly one import in the whole
 * plugin. That import starts one program: the Marp CLI the reader configured.
 * A `termlogue` block is still, as it has always been, text.
 */

/** `child_process.spawn`, narrowed to what the runner uses. */
export const nodeSpawn: SpawnFn = (command, args, options) => spawn(command, [...args], options);

/**
 * `Promise`-shaped `setTimeout`.
 *
 * `globalThis` rather than `window`: this module is the plugin's Node side —
 * spawning Marp CLI, watching for its output — and the tests exercise it in
 * Node, where there is no window. Nothing here draws anything, so the popout
 * window a timer could belong to does not arise.
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

/** True when the path is a file with something in it. */
export function hasContent(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The `PATH` lookup environment for the process the plugin is running in. */
export function executableEnvironment(): ExecutableEnvironment {
  return {
    platform: process.platform,
    path: process.env.PATH,
    pathExt: process.env.PATHEXT,
    isFile,
    join,
    isPathLike: (value) => value.includes('/') || value.includes('\\') || isAbsolute(value),
  };
}

/** The workspace's file operations, backed by `node:fs`. */
export const nodeWorkspaceFileSystem: WorkspaceFileSystem = {
  makeDirectory(path) {
    mkdirSync(path, { recursive: true });
  },
  writeFile(path, contents) {
    writeFileSync(path, contents, 'utf8');
  },
  listDirectory(path) {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
  isDirectory(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  modifiedAt(path) {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return null;
    }
  },
  removeDirectory(path) {
    rmSync(path, { recursive: true, force: true });
  },
};
