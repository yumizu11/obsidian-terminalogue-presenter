import { buildSpawnTarget, type SpawnTargetEnvironment } from './command-line.js';

/**
 * Running Marp CLI.
 *
 * The runner owns two things: which arguments Marp gets, and how the process is
 * started. Everything it depends on — `spawn`, the platform, the clock — is
 * injected, so the argument list and the spawn call can be asserted without a
 * Marp installation anywhere near the test.
 */

/** The subset of a child process the runner uses. */
export interface SpawnedProcess {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null, signal: string | null) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface SpawnOptionsLike {
  cwd: string;
  shell: false;
  windowsHide: boolean;
  /**
   * Marp CLI is never given anything to read: Obsidian has no console for it
   * to inherit, and a pipe nobody ever writes to is a process that can wait
   * for input forever.
   */
  stdio: ['ignore', 'pipe', 'pipe'];
  windowsVerbatimArguments?: boolean;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsLike,
) => SpawnedProcess;

/** One Marp CLI conversion. */
export interface MarpRequest {
  /** Absolute path to the Markdown note. */
  input: string;
  /** Absolute path Marp should write the HTML to. */
  output: string;
  /** Absolute path to the bundled Terminalogue engine module. */
  engine: string;
  /**
   * Working directory. It is the note's own folder, so Marp CLI finds a
   * `marp.config.*` the user keeps beside their deck exactly as it would from
   * a terminal.
   */
  cwd: string;
  /** Keep converting as the note changes. */
  watch?: boolean;
}

/** How a finished process ended. */
export interface MarpResult {
  ok: boolean;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Set when the process could not be started at all. */
  error?: Error;
}

/** A process that is running, or has just finished. */
export interface MarpRun {
  readonly done: Promise<MarpResult>;
  /** True until the process has exited. */
  readonly running: boolean;
  /** Ends the process. Safe to call after it has already ended. */
  stop(): void;
}

export interface MarpRunnerOptions {
  spawn: SpawnFn;
  environment: SpawnTargetEnvironment;
}

/**
 * The arguments for one conversion.
 *
 * `--engine` is the documented way to point Marp CLI at a Marpit-based engine,
 * and it is the only thing Terminalogue Presenter imposes: the theme, the
 * pagination, the header, the footer and every other directive stay wherever
 * the author put them, in the deck's front matter or in their own config file.
 */
export function buildMarpArguments(request: MarpRequest): string[] {
  return [
    '--engine',
    request.engine,
    '--output',
    request.output,
    ...(request.watch === true ? ['--watch'] : []),
    request.input,
  ];
}

export class MarpRunner {
  constructor(private readonly options: MarpRunnerOptions) {}

  /** Starts one conversion. Rejects nothing: failure arrives through `done`. */
  run(executable: string, request: MarpRequest): MarpRun {
    return this.spawn(executable, buildMarpArguments(request), request.cwd);
  }

  /** Runs `marp --version`, which is what the Test Marp button reports. */
  async version(executable: string, cwd: string): Promise<string | null> {
    const result = await this.spawn(executable, ['--version'], cwd).done;
    if (!result.ok) return null;
    // "@marp-team/marp-cli v4.2.1 (w/ @marp-team/marp-core v4.0.1)"
    const output = `${result.stdout}\n${result.stderr}`;
    return /v?\d+\.\d+\.\d+[^\s)]*/.exec(output)?.[0] ?? output.trim().split('\n')[0] ?? null;
  }

  private spawn(executable: string, args: readonly string[], cwd: string): MarpRun {
    const target = buildSpawnTarget(executable, args, this.options.environment);

    let child: SpawnedProcess;
    let running = true;
    let stdout = '';
    let stderr = '';

    const done = new Promise<MarpResult>((resolve) => {
      const settle = (result: MarpResult): void => {
        if (!running) return;
        running = false;
        resolve(result);
      };

      try {
        child = this.options.spawn(target.command, target.args, {
          cwd,
          // Terminalogue Presenter never runs a shell. The one exception,
          // a Windows batch launcher, is an explicit `cmd.exe` with a command
          // line built by buildSpawnTarget and passed through verbatim.
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...(target.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
        });
      } catch (error) {
        settle(failure(error));
        return;
      }

      child.stdout?.on('data', (chunk: unknown) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk: unknown) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => settle({ ...failure(error), stdout, stderr }));
      child.on('close', (code, signal) => {
        settle({ ok: code === 0, code, signal, stdout, stderr });
      });
    });

    return {
      done,
      get running() {
        return running;
      },
      stop(): void {
        if (!running) return;
        try {
          child?.kill();
        } catch {
          // The process was already gone. Stopping something that has stopped
          // is not an error the user needs to hear about.
        }
      },
    };
  }
}

function failure(error: unknown): MarpResult {
  return {
    ok: false,
    code: null,
    signal: null,
    stdout: '',
    stderr: '',
    error: error instanceof Error ? error : new Error(String(error)),
  };
}
