/**
 * The one Electron API Terminalogue Presenter uses.
 *
 * Declared here rather than pulled in as a dependency: Obsidian Desktop
 * provides Electron at runtime, and this plugin needs one function from it.
 */
declare module 'electron' {
  export const shell: {
    /** Hands a URL to the operating system's default handler. */
    openExternal(url: string): Promise<void>;
  };
}
