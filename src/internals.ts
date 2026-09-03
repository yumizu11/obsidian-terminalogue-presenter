/**
 * The parts of Terminalogue Presenter that need no Obsidian window.
 *
 * Bundled separately so the unit tests can exercise the real modules — the
 * argument list Marp CLI is given, how a Windows batch launcher is spawned,
 * the process lifetime rules and the scratch directory — against injected
 * dependencies, with no Marp installation and no vault anywhere in sight.
 */
export { UnsafeArgumentError, buildSpawnTarget } from './marp/command-line.js';
export type { SpawnTarget, SpawnTargetEnvironment } from './marp/command-line.js';
export { DEFAULT_EXECUTABLE_NAME, findOnPath, resolveExecutable } from './marp/executable.js';
export type { ExecutableEnvironment } from './marp/executable.js';
export { MarpRunner, buildMarpArguments } from './marp/runner.js';
export type { MarpRequest, MarpResult, MarpRun, SpawnFn } from './marp/runner.js';
export { MarpProcessManager } from './marp/process-manager.js';
export type { PresentationOutcome } from './marp/process-manager.js';
export {
  ENGINE_MODULE,
  PRESENTATION_HTML,
  PresenterWorkspace,
  STALE_SESSION_MS,
  WORKSPACE_DIRECTORY,
} from './marp/workspace.js';
export type { PresenterSession, WorkspaceFileSystem } from './marp/workspace.js';
export {
  MARP_NOT_FOUND,
  NOT_MARKDOWN,
  NO_ACTIVE_NOTE,
  checkNote,
  exportPathFor,
} from './notes.js';
export type { NoteCheck, NoteLike } from './notes.js';
export { fileUrl, openInBrowser } from './browser.js';
export type { ExternalOpener } from './browser.js';
export { DEFAULT_SETTINGS } from './settings-defaults.js';
export type { PresenterSettings } from './settings-defaults.js';
