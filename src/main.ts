import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FileSystemAdapter, MarkdownView, Notice, Plugin, type TFile } from 'obsidian';
import { openInBrowser, type ExternalOpener } from './browser.js';
import { confirm } from './confirm.js';
import { electronOpener } from './electron.js';
import { TERMINALOGUE_MARP_ENGINE } from './generated/engine-source.js';
import { resolveExecutable } from './marp/executable.js';
import { MarpProcessManager } from './marp/process-manager.js';
import { MarpRunner } from './marp/runner.js';
import { PresenterWorkspace, type PresenterSession } from './marp/workspace.js';
import { MARP_NOT_FOUND, checkNote, exportPathFor } from './notes.js';
import {
  delay,
  executableEnvironment,
  hasContent,
  nodeSpawn,
  nodeWorkspaceFileSystem,
} from './platform.js';
import {
  DEFAULT_SETTINGS,
  PresenterSettingTab,
  type PresenterSettings,
  type PresenterSettingsHost,
} from './settings.js';

/**
 * Terminalogue Presenter.
 *
 * The companion to the Terminalogue plugin, and a separate plugin on purpose:
 * converting a note with Marp CLI means starting a process, which needs Node
 * and Electron, which would make Terminalogue itself desktop only. Terminalogue
 * renders Markdown and runs everywhere; Terminalogue Presenter runs Marp and
 * runs on the desktop.
 *
 * The one program it ever starts is the configured Marp CLI. The commands
 * inside a `termlogue` block are, here as everywhere else, text.
 */

const LOG_PREFIX = '[Terminalogue Presenter]';
const NO_LOCAL_VAULT =
  'Terminalogue Presenter needs a vault stored on this computer’s file system.';

/** Everything a command needs once its checks have passed. */
interface CommandContext {
  note: TFile;
  executable: string;
  /** Absolute path of the saved note. */
  input: string;
  /** The note's folder, so Marp CLI finds a config file kept beside the deck. */
  cwd: string;
}

export default class TerminaloguePresenterPlugin extends Plugin implements PresenterSettingsHost {
  override settings: PresenterSettings = { ...DEFAULT_SETTINGS };

  private runner!: MarpRunner;
  private processes!: MarpProcessManager;
  private workspace!: PresenterWorkspace;
  private opener: ExternalOpener = electronOpener();
  /** The session a watch process is still writing into, if any. */
  private watchedSession: PresenterSession | null = null;

  override async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as PresenterSettings) };

    this.runner = new MarpRunner({
      spawn: nodeSpawn,
      environment: { platform: process.platform, comSpec: process.env.ComSpec },
    });
    this.processes = new MarpProcessManager({
      runner: this.runner,
      hasOutput: hasContent,
      delay,
    });
    this.workspace = new PresenterWorkspace({
      fs: nodeWorkspaceFileSystem,
      temporaryDirectory: tmpdir(),
      join,
      engineSource: TERMINALOGUE_MARP_ENGINE,
      log: (message, detail) => this.log(message, detail),
    });
    // Anything an earlier Obsidian session left behind, without touching a
    // single byte of the temporary directory that is not ours.
    this.workspace.cleanupStale();

    // Obsidian prefixes both the id and the name with the plugin, so neither
    // repeats "Terminalogue Presenter" here.
    this.addCommand({
      id: 'present',
      name: 'Present current note',
      callback: () => void this.present(false),
    });
    this.addCommand({
      id: 'present-watch',
      name: 'Present current note with watch',
      callback: () => void this.present(true),
    });
    this.addCommand({
      id: 'export-html',
      name: 'Export current note to HTML',
      callback: () => void this.exportHtml(),
    });
    this.addCommand({
      id: 'stop',
      name: 'Stop presentation',
      callback: () => this.stopPresentation(),
    });

    this.addSettingTab(new PresenterSettingTab(this));
  }

  override onunload(): void {
    // Obsidian is closing, or the plugin is being disabled: no Marp process
    // outlives either.
    this.processes.dispose();
    this.watchedSession = null;
    this.workspace.dispose();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** The Test Marp button. Runs `marp --version` and says what came back. */
  async testMarp(): Promise<string> {
    const executable = this.executable();
    if (executable === null) return 'Marp CLI was not found. Check the executable path.';

    const version = await this.runner.version(executable, tmpdir());
    return version === null
      ? 'Marp CLI was not found. Check the executable path.'
      : `Marp CLI detected: ${version}`;
  }

  /** Present current note, with or without watch mode. */
  private async present(watch: boolean): Promise<void> {
    const context = await this.prepare();
    if (!context) return;

    new Notice('Generating presentation…');

    const session = this.workspace.createSession();
    const outcome = watch
      ? await this.processes.startWatch(context.executable, {
          input: context.input,
          output: session.htmlPath,
          engine: session.enginePath,
          cwd: context.cwd,
        })
      : await this.processes.convert(context.executable, {
          input: context.input,
          output: session.htmlPath,
          engine: session.enginePath,
          cwd: context.cwd,
        });

    if (!outcome.ok) {
      // Starting a watch stops whatever was watching before it, so a failed
      // watch leaves nothing running and nothing worth keeping.
      if (watch) this.watchedSession = null;
      this.workspace.cleanupOwnExcept([this.watchedSession]);
      this.fail(outcome.message, outcome.detail);
      return;
    }

    this.watchedSession = watch ? session : this.watchedSession;
    // The previous presentation's scratch directory can go now that this one
    // has been written — but not while a watch process is still using it.
    this.workspace.cleanupOwnExcept([session, this.watchedSession]);

    await this.reveal(
      session.htmlPath,
      watch ? 'Watching presentation…' : 'Presentation opened in browser.',
    );
  }

  /** Export current note to HTML, beside the note, as a file that stays. */
  private async exportHtml(): Promise<void> {
    const context = await this.prepare();
    if (!context) return;

    const destination = exportPathFor(context.note);
    if (this.app.vault.getAbstractFileByPath(destination) !== null) {
      const replace = await confirm(this.app, {
        title: 'Replace the existing HTML?',
        body: `"${destination}" already exists in this vault. Exporting replaces it.`,
        confirmText: 'Replace',
      });
      if (!replace) return;
    }

    const output = this.absolutePath(destination);
    if (output === null) {
      new Notice(NO_LOCAL_VAULT);
      return;
    }

    new Notice('Generating presentation…');
    const session = this.workspace.createSession();
    const outcome = await this.processes.convert(context.executable, {
      input: context.input,
      output,
      engine: session.enginePath,
      cwd: context.cwd,
    });
    this.workspace.cleanupOwnExcept([this.watchedSession]);

    if (!outcome.ok) {
      this.fail(outcome.message, outcome.detail);
      return;
    }
    new Notice('HTML exported successfully.');
  }

  /** Stop presentation. Saying so is the whole job; it is never an error. */
  private stopPresentation(): void {
    const stopped = this.processes.stop();
    this.watchedSession = null;
    this.workspace.cleanupOwnExcept([]);
    new Notice(stopped ? 'Presentation stopped.' : 'No presentation is running.');
  }

  /**
   * The checks every command shares: an eligible note, saved to disk, and a
   * Marp CLI to run it through.
   */
  private async prepare(): Promise<CommandContext | null> {
    const check = checkNote(this.app.workspace.getActiveFile());
    if (!check.ok) {
      new Notice(check.message);
      return null;
    }
    const note = check.note;

    // Marp reads the file from disk, so what is on screen has to be on disk.
    await this.saveNote(note);

    const executable = this.executable();
    if (executable === null) {
      new Notice(MARP_NOT_FOUND);
      return null;
    }

    const input = this.absolutePath(note.path);
    if (input === null) {
      new Notice(NO_LOCAL_VAULT);
      return null;
    }

    return { note, executable, input, cwd: dirname(input) };
  }

  /** Flushes the editor's unsaved changes, so Marp converts what is on screen. */
  private async saveNote(note: TFile): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path !== note.path) return;
    try {
      await view.save();
    } catch (error) {
      this.log('Could not save the note before converting it', error);
    }
  }

  private async reveal(htmlPath: string, message: string): Promise<void> {
    if (!this.settings.openBrowserAutomatically) {
      new Notice(`${message}\n${htmlPath}`);
      return;
    }
    try {
      await openInBrowser(htmlPath, this.opener);
      new Notice(message);
    } catch (error) {
      this.log('Could not open the default browser', error);
      new Notice(`Could not open the default browser.\n${htmlPath}`);
    }
  }

  private executable(): string | null {
    return resolveExecutable(this.settings.marpExecutable, executableEnvironment());
  }

  /** The path on disk for a vault path, or `null` for a non-local vault. */
  private absolutePath(vaultPath: string): string | null {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getFullPath(vaultPath) : null;
  }

  /** One short Notice; the rest of the story goes to the console. */
  private fail(message: string, detail?: string): void {
    this.log(message, detail);
    new Notice(message);
  }

  private log(message: string, detail?: unknown): void {
    if (detail === undefined) console.error(LOG_PREFIX, message);
    else console.error(LOG_PREFIX, message, detail);
  }
}
