/**
 * Finding the Marp CLI executable.
 *
 * Obsidian is usually started from a launcher rather than from a shell, so its
 * `PATH` can be much shorter than the one `marp` works from in a terminal.
 * That is why the setting exists, and why nothing here hard-codes a per-OS
 * installation directory: the lookup walks `PATH` and stops, and the user is
 * told to name the executable when it comes up empty.
 */

/** The command a default installation of Marp CLI provides. */
export const DEFAULT_EXECUTABLE_NAME = 'marp';

/** Extensions Windows treats as executable, when `PATHEXT` says nothing. */
const DEFAULT_PATH_EXT = '.COM;.EXE;.BAT;.CMD';

export interface ExecutableEnvironment {
  /** `process.platform`. */
  platform: string;
  /** `process.env.PATH`. */
  path?: string | undefined;
  /** `process.env.PATHEXT`, Windows only. */
  pathExt?: string | undefined;
  /** True when the given absolute path is an existing file. */
  isFile(candidate: string): boolean;
  /** `path.join`, injected so the lookup can be tested for either platform. */
  join(directory: string, name: string): string;
  /** True when the string already names a path rather than a bare command. */
  isPathLike(value: string): boolean;
}

/**
 * Resolves the executable to run, or `null` when there is nothing to run.
 *
 * A configured value that looks like a path is taken as it is — that is the
 * escape hatch for an installation `PATH` does not mention. A bare command is
 * looked up on `PATH`, and an empty setting means "find `marp` yourself".
 */
export function resolveExecutable(
  configured: string,
  environment: ExecutableEnvironment,
): string | null {
  const setting = configured.trim();

  if (setting !== '') {
    if (environment.isPathLike(setting)) return environment.isFile(setting) ? setting : null;
    return findOnPath(setting, environment);
  }

  return findOnPath(DEFAULT_EXECUTABLE_NAME, environment);
}

/**
 * The first entry in `PATH` that provides `name`.
 *
 * On Windows a command is spelled without its extension, so each `PATHEXT`
 * suffix is tried too — which is also how the `.cmd` launcher an npm global
 * install writes gets found, and named in full, so the spawn side knows it
 * needs an interpreter.
 */
export function findOnPath(name: string, environment: ExecutableEnvironment): string | null {
  const windows = environment.platform === 'win32';
  const separator = windows ? ';' : ':';
  const directories = (environment.path ?? '')
    .split(separator)
    .map((directory) => directory.trim().replace(/^"(.*)"$/, '$1'))
    .filter((directory) => directory !== '');

  const suffixes = windows ? ['', ...windowsExtensions(environment.pathExt)] : [''];

  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = environment.join(directory, `${name}${suffix}`);
      if (environment.isFile(candidate)) return candidate;
    }
  }
  return null;
}

function windowsExtensions(pathExt: string | undefined): string[] {
  const configured = pathExt?.trim();
  return (configured === undefined || configured === '' ? DEFAULT_PATH_EXT : configured)
    .split(';')
    // `PATHEXT` is conventionally upper case and Windows file names are case
    // insensitive, so the extension is lower-cased: the resolved path ends up
    // spelled the way it is on disk, which is the path a log or an error
    // message shows the reader.
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.startsWith('.'));
}
