import { pathToFileURL } from 'node:url';

/**
 * Opening a generated presentation in the reader's default browser.
 *
 * The path never becomes part of a command. It is converted to a `file:` URL
 * with Node's own `pathToFileURL`, which percent-encodes everything a URL
 * cannot carry, and handed to the shell integration as a single string — so a
 * vault in `~/My Notes & Slides/` opens exactly like any other.
 */

/** Hands one URL to the operating system. */
export type ExternalOpener = (url: string) => Promise<void> | void;

/** The `file:` URL for an absolute path. */
export function fileUrl(path: string): string {
  return pathToFileURL(path).href;
}

/**
 * Opens a generated file in the default browser.
 *
 * Called only after a conversion has succeeded and the file is on disk, so a
 * failed conversion never opens a window, and a watch-mode reconversion never
 * opens a second one.
 */
export async function openInBrowser(path: string, opener: ExternalOpener): Promise<void> {
  await opener(fileUrl(path));
}
