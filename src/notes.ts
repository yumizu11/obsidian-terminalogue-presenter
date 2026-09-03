/**
 * What every command checks before it starts a process.
 *
 * The three answers a command can give are all here, so all four commands fail
 * the same way and say the same thing.
 */

/** The little of a `TFile` these checks need. */
export interface NoteLike {
  path: string;
  extension: string;
  basename: string;
}

export type NoteCheck<T extends NoteLike = NoteLike> =
  | { ok: true; note: T }
  | { ok: false; message: string };

export const NO_ACTIVE_NOTE = 'No active Markdown note.';
export const NOT_MARKDOWN = 'The current file is not a Markdown file.';
export const MARP_NOT_FOUND =
  'Marp CLI was not found. Configure the Marp executable in Terminalogue Presenter settings.';

/** Extensions Obsidian itself treats as Markdown. */
const MARKDOWN = new Set(['md', 'markdown']);

/** Decides whether a command may run against the file the reader is looking at. */
export function checkNote<T extends NoteLike>(file: T | null | undefined): NoteCheck<T> {
  if (!file) return { ok: false, message: NO_ACTIVE_NOTE };
  if (!MARKDOWN.has(file.extension.toLowerCase())) {
    return { ok: false, message: NOT_MARKDOWN };
  }
  return { ok: true, note: file };
}

/**
 * The vault path Export writes to: the note's own path with an `.html`
 * extension, so `talks/deploy.md` becomes `talks/deploy.html`.
 */
export function exportPathFor(note: NoteLike): string {
  return `${note.path.replace(/\.[^./\\]+$/, '')}.html`;
}
