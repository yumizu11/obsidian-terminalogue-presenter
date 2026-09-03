/**
 * Turning an executable and a list of arguments into something that can be
 * spawned, without ever building a shell command out of a path.
 *
 * Terminalogue Presenter runs exactly one program: the Marp CLI the user
 * configured. Everything else — the note, the output file, the engine — is a
 * path, and a path is data. It is passed as an argument, never concatenated
 * into a command string, and `shell` is always `false`.
 *
 * Windows needs one exception. An npm global install of Marp CLI is a `.cmd`
 * launcher, and since the April 2024 security releases Node refuses to spawn
 * a `.cmd` or `.bat` file directly. Those have to go through `cmd.exe`, which
 * means one command line does have to be built — so it is built here, once,
 * by rules that are tested rather than assumed.
 */

/** Everything needed to spawn Marp CLI. `shell` is never part of it. */
export interface SpawnTarget {
  /** The program to run. */
  command: string;
  /** Its arguments, already separated. */
  args: string[];
  /**
   * Set only on the `cmd.exe` path, where `args` is one pre-quoted command
   * line that Node must pass through untouched.
   */
  windowsVerbatimArguments: boolean;
}

export interface SpawnTargetEnvironment {
  /** `process.platform`. */
  platform: string;
  /** `process.env.ComSpec`, the path to the command interpreter. */
  comSpec?: string | undefined;
}

/** A path that cannot be passed to `cmd.exe` safely. */
export class UnsafeArgumentError extends Error {
  override readonly name = 'UnsafeArgumentError';

  constructor(readonly argument: string) {
    super(
      'Terminalogue Presenter cannot pass this path to the Windows command ' +
        `interpreter safely: ${argument}`,
    );
  }
}

/** Windows launchers that Node will not spawn without an interpreter. */
const BATCH_LAUNCHER = /\.(cmd|bat)$/i;

/** Characters that would end a quoted `cmd.exe` argument or the line itself. */
const UNQUOTABLE = /["\r\n\0]/;

/**
 * Builds the spawn target for one Marp CLI invocation.
 *
 * Everywhere but a Windows batch launcher this is the identity: the executable
 * and its arguments go straight to `spawn` with no interpreter in between, so
 * spaces, quotes, `&`, `;`, `$` and every other character in a path are inert.
 */
export function buildSpawnTarget(
  executable: string,
  args: readonly string[],
  environment: SpawnTargetEnvironment,
): SpawnTarget {
  if (environment.platform !== 'win32' || !BATCH_LAUNCHER.test(executable)) {
    return { command: executable, args: [...args], windowsVerbatimArguments: false };
  }

  // `cmd /s /c "<line>"` strips exactly the outermost pair of quotes and takes
  // the rest verbatim, so each token is quoted individually inside that pair.
  // Quoting is what makes `&`, `|`, `>`, `;`, `^` and `!` ordinary characters,
  // and the npm launcher forwards the tail with `%*`, which keeps the quotes.
  const line = `"${[executable, ...args].map(quoteForCmd).join(' ')}"`;

  return {
    command: interpreter(environment.comSpec),
    args: ['/d', '/s', '/c', line],
    windowsVerbatimArguments: true,
  };
}

/**
 * Quotes one token for `cmd.exe`.
 *
 * A `"` cannot appear in a Windows path at all, so a token containing one is
 * rejected rather than escaped: there is no correct escaping that survives both
 * `cmd.exe` and the batch launcher's own re-parsing, and refusing is the honest
 * answer.
 */
function quoteForCmd(token: string): string {
  if (UNQUOTABLE.test(token)) throw new UnsafeArgumentError(token);
  // A run of backslashes before the closing quote would escape it, so it is
  // doubled: `C:\dir\` has to arrive as `C:\dir\`, not as an unterminated word.
  return `"${token.replace(/(\\+)$/, (run) => run + run)}"`;
}

function interpreter(comSpec: string | undefined): string {
  const configured = comSpec?.trim() ?? '';
  return configured === '' ? 'cmd.exe' : configured;
}
