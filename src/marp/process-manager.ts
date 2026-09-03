import type { MarpRequest, MarpResult, MarpRun, MarpRunner } from './runner.js';

/**
 * The one place a Marp CLI process is started, waited for and stopped.
 *
 * Obsidian keeps running long after a conversion does, so the rules here are
 * about lifetime rather than conversion: exactly one watch at a time, a new
 * watch replaces the old one, Stop is always safe, and unloading the plugin
 * leaves nothing behind. A process that failed to start is never counted as
 * running.
 */

/** What happened, in the two levels of detail the UI needs. */
export interface PresentationOutcome {
  ok: boolean;
  /** Short, for a Notice. */
  message: string;
  /** Long, for the developer console. */
  detail?: string;
}

export interface ProcessManagerOptions {
  runner: MarpRunner;
  /** True once Marp has written something to the output path. */
  hasOutput(path: string): boolean;
  /** Resolves after `ms`; injected so tests need no real time. */
  delay(ms: number): Promise<void>;
  /** How long to wait for watch mode's first conversion. Default 60s. */
  watchTimeoutMs?: number;
  /** How often to look for that first conversion. Default 100ms. */
  pollIntervalMs?: number;
}

const FAILED = 'Failed to generate presentation.';

export class MarpProcessManager {
  private readonly options: Required<ProcessManagerOptions>;
  private watch: { notePath: string; run: MarpRun } | null = null;
  private readonly oneShots = new Set<MarpRun>();
  private disposed = false;

  constructor(options: ProcessManagerOptions) {
    this.options = {
      watchTimeoutMs: 60_000,
      pollIntervalMs: 100,
      ...options,
    };
  }

  /** True while a watch process is converting a note. */
  get isWatching(): boolean {
    return this.watch !== null;
  }

  /** The note the watch process is following, or `null`. */
  get watchedNote(): string | null {
    return this.watch?.notePath ?? null;
  }

  /** Runs one conversion to completion. Used by Present and by Export. */
  async convert(executable: string, request: MarpRequest): Promise<PresentationOutcome> {
    if (this.disposed) return { ok: false, message: FAILED, detail: 'The plugin is unloading.' };

    const run = this.options.runner.run(executable, request);
    this.oneShots.add(run);
    try {
      return describe(await run.done, request.output, this.options.hasOutput);
    } finally {
      this.oneShots.delete(run);
    }
  }

  /**
   * Starts watch mode and resolves once Marp has produced the first HTML.
   *
   * Waiting for that first file is what lets the browser be opened exactly
   * once: every later conversion reaches the already-open page through Marp
   * CLI's own reload channel, not through another window.
   */
  async startWatch(executable: string, request: MarpRequest): Promise<PresentationOutcome> {
    if (this.disposed) return { ok: false, message: FAILED, detail: 'The plugin is unloading.' };

    // One watch at a time, whichever note it was following.
    this.stopWatch();

    const run = this.options.runner.run(executable, { ...request, watch: true });
    this.watch = { notePath: request.input, run };
    // A watch process outlives this call, so the bookkeeping has to be cleared
    // whenever it ends — including when Marp exits on its own.
    void run.done.then(() => {
      if (this.watch?.run === run) this.watch = null;
    });

    const outcome = await this.waitForFirstConversion(run, request.output);
    if (!outcome.ok) {
      run.stop();
      if (this.watch?.run === run) this.watch = null;
    }
    return outcome;
  }

  /**
   * Stops everything this manager started.
   *
   * Returns whether there was anything to stop, so the caller can say
   * "Presentation stopped." only when one actually was.
   */
  stop(): boolean {
    let stopped = this.stopWatch();
    for (const run of Array.from(this.oneShots)) {
      run.stop();
      this.oneShots.delete(run);
      stopped = true;
    }
    return stopped;
  }

  /** Stops everything and refuses to start anything else. */
  dispose(): void {
    this.stop();
    this.disposed = true;
  }

  private stopWatch(): boolean {
    const current = this.watch;
    if (!current) return false;
    this.watch = null;
    current.run.stop();
    return true;
  }

  /** Polls for the first HTML, giving up if Marp exits or takes too long. */
  private async waitForFirstConversion(run: MarpRun, output: string): Promise<PresentationOutcome> {
    const { delay, hasOutput, pollIntervalMs, watchTimeoutMs } = this.options;
    const deadline = Math.max(1, Math.ceil(watchTimeoutMs / Math.max(1, pollIntervalMs)));

    for (let attempt = 0; attempt < deadline; attempt++) {
      if (hasOutput(output)) {
        // Marp is still writing the file when it first appears; a short settle
        // keeps the browser from opening a half-written page.
        await delay(pollIntervalMs);
        return { ok: true, message: 'Watching presentation…' };
      }
      if (!run.running) {
        return describe(await run.done, output, hasOutput);
      }
      await delay(pollIntervalMs);
    }

    return {
      ok: false,
      message: FAILED,
      detail: `Marp CLI produced no output within ${watchTimeoutMs}ms of starting watch mode.`,
    };
  }
}

/**
 * Turns a finished process into an outcome.
 *
 * Marp CLI's stderr can be a stack trace; it belongs in the console, not in a
 * Notice, so the message stays one sentence and the detail carries the rest.
 */
function describe(
  result: MarpResult,
  output: string,
  hasOutput: (path: string) => boolean,
): PresentationOutcome {
  if (result.error) {
    return { ok: false, message: FAILED, detail: result.error.message };
  }
  if (!result.ok) {
    return {
      ok: false,
      message: FAILED,
      detail: `Marp CLI exited with code ${result.code ?? 'null'} (signal ${
        result.signal ?? 'none'
      }).\n${result.stderr || result.stdout}`.trim(),
    };
  }
  if (!hasOutput(output)) {
    return {
      ok: false,
      message: FAILED,
      detail: `Marp CLI reported success but wrote nothing to ${output}.`,
    };
  }
  return { ok: true, message: 'Presentation generated.' };
}
