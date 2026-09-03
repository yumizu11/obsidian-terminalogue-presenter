/**
 * The scratch directory Present converts into.
 *
 * Present must not leave files in the vault, so it writes into the operating
 * system's temporary directory instead — but only ever inside one directory of
 * its own, one level down, with a name this module generates. Nothing here
 * removes anything it did not create, and the shape of that name is what the
 * cleanup checks before it deletes.
 */

/** The single directory Terminalogue Presenter owns under the temp directory. */
export const WORKSPACE_DIRECTORY = 'terminalogue-presenter';

/** File names inside a session directory. */
export const PRESENTATION_HTML = 'presentation.html';
export const ENGINE_MODULE = 'terminalogue-marp-engine.mjs';

/** Sessions older than this are somebody's leftovers, not somebody's slides. */
export const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

/** Only a directory named exactly like this is ever deleted. */
const SESSION_NAME = /^session-[0-9a-z]+-[0-9a-z]+$/;

export interface WorkspaceFileSystem {
  /** Creates a directory and every missing parent. */
  makeDirectory(path: string): void;
  writeFile(path: string, contents: string): void;
  /** Entry names directly inside a directory, or `[]` when there is none. */
  listDirectory(path: string): string[];
  isDirectory(path: string): boolean;
  /** Last modification time in ms, or `null` when the path is unreadable. */
  modifiedAt(path: string): number | null;
  /** Removes a directory and its contents. */
  removeDirectory(path: string): void;
}

export interface WorkspaceOptions {
  fs: WorkspaceFileSystem;
  /** The operating system's temporary directory. */
  temporaryDirectory: string;
  join(...segments: string[]): string;
  /** The bundled Terminalogue Marp engine, written into every session. */
  engineSource: string;
  now?: () => number;
  /** Source of the random half of a session id. */
  random?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

/** One Present or Export run's own directory. */
export interface PresenterSession {
  id: string;
  directory: string;
  /** Where Marp CLI is told to write the presentation. */
  htmlPath: string;
  /** Where the self-contained Terminalogue engine was written. */
  enginePath: string;
}

export class PresenterWorkspace {
  private readonly options: Required<Omit<WorkspaceOptions, 'log'>> & Pick<WorkspaceOptions, 'log'>;
  private readonly created: string[] = [];

  constructor(options: WorkspaceOptions) {
    this.options = { now: Date.now, random: Math.random, ...options };
  }

  /** The directory this plugin owns. Nothing outside it is ever touched. */
  get root(): string {
    return this.options.join(this.options.temporaryDirectory, WORKSPACE_DIRECTORY);
  }

  /**
   * Creates a fresh session directory with the engine already in it.
   *
   * The engine is written per session rather than shared, so a session
   * directory is self-contained and removing it removes everything about that
   * presentation.
   */
  createSession(): PresenterSession {
    const { fs, join } = this.options;
    const id = this.nextId();
    const directory = join(this.root, id);

    fs.makeDirectory(directory);
    const enginePath = join(directory, ENGINE_MODULE);
    fs.writeFile(enginePath, this.options.engineSource);

    this.created.push(directory);
    return { id, directory, htmlPath: join(directory, PRESENTATION_HTML), enginePath };
  }

  /**
   * Removes session directories older than `maxAgeMs`.
   *
   * A presentation that is still open in a browser reads its HTML from disk
   * only once, but another Obsidian window may still be watching, so age is
   * the guard rather than "everything except mine".
   */
  cleanupStale(maxAgeMs: number = STALE_SESSION_MS): void {
    const { fs, join, now } = this.options;
    const cutoff = now() - maxAgeMs;

    for (const name of fs.listDirectory(this.root)) {
      if (!SESSION_NAME.test(name)) continue;
      const directory = join(this.root, name);
      if (!fs.isDirectory(directory)) continue;
      const modified = fs.modifiedAt(directory);
      if (modified !== null && modified > cutoff) continue;
      this.remove(directory);
    }
  }

  /** Removes every session this instance created. Used on plugin unload. */
  dispose(): void {
    for (const directory of this.created.splice(0)) this.remove(directory);
  }

  /**
   * Removes the sessions this instance created, except the ones still in use.
   *
   * A presentation the reader is looking at is not in use — a browser has
   * already read the file — but one a watch process is still writing to is.
   */
  cleanupOwnExcept(keep: readonly (PresenterSession | null)[]): void {
    const kept = new Set(
      keep.filter((session): session is PresenterSession => session !== null).map((s) => s.directory),
    );
    for (let index = this.created.length - 1; index >= 0; index--) {
      const directory = this.created[index]!;
      if (kept.has(directory)) continue;
      this.created.splice(index, 1);
      this.remove(directory);
    }
  }

  private remove(directory: string): void {
    try {
      this.options.fs.removeDirectory(directory);
    } catch (error) {
      // A directory a browser still has open can refuse to go on Windows.
      // Leaving it for the next stale sweep is better than a failed command.
      this.options.log?.(`Could not remove ${directory}`, error);
    }
  }

  private nextId(): string {
    const stamp = Math.floor(this.options.now()).toString(36);
    const suffix = Math.floor(this.options.random() * 0xffffff)
      .toString(36)
      .padStart(4, '0');
    return `session-${stamp}-${suffix}`;
  }
}
