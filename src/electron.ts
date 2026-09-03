import { shell } from 'electron';
import type { ExternalOpener } from './browser.js';

/**
 * The default way a generated presentation reaches the reader's browser.
 *
 * `shell.openExternal` takes one URL and hands it to the operating system's
 * default handler — a `file:` URL for an HTML file means the default browser.
 * No command line is involved, so no path can become part of one.
 *
 * Kept in its own module because it is the only thing in the plugin that needs
 * Electron, and Electron is exactly why Terminalogue Presenter is a separate,
 * desktop-only plugin rather than part of Terminalogue itself.
 */
export function electronOpener(): ExternalOpener {
  return (url: string) => shell.openExternal(url);
}
