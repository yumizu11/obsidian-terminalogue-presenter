/**
 * Terminalogue Presenter's settings, and nothing that needs Obsidian to read
 * them — so the shape and the defaults can be asserted in a plain test.
 *
 * Deliberately two settings. Where Present writes its temporary HTML is not
 * one of them: it is managed, cleaned up, and none of the reader's business.
 */
export interface PresenterSettings {
  /**
   * The Marp CLI executable. Empty means "find `marp` on PATH", which is what
   * a terminal would do; a full path is the answer when Obsidian's PATH is
   * shorter than the shell's, which it usually is when Obsidian was started
   * from a launcher rather than from a terminal.
   */
  marpExecutable: string;
  /** Open the generated presentation in the default browser. */
  openBrowserAutomatically: boolean;
}

export const DEFAULT_SETTINGS: PresenterSettings = {
  marpExecutable: '',
  openBrowserAutomatically: true,
};
