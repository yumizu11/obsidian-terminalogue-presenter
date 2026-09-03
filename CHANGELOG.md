# Changelog

All notable changes to Terminalogue Presenter are documented here.

## 0.5.2

The first release from this repository. Terminalogue Presenter previously lived in the
[Terminalogue](https://github.com/yumizu11/Terminalogue) monorepo, alongside the
Terminalogue plugin that renders `termlogue` blocks in Reading View. Obsidian's community
directory identifies a plugin by the `manifest.json` at the root of a repository, so a
plugin that wants a listing of its own needs a repository of its own. The plugin itself is
the one that has been in use since 0.4.0; nothing about how it works has changed in the
move.

### Fixed

- The settings tab set a margin and an opacity from JavaScript, which a theme cannot
  restyle. The status line now uses Obsidian's own `setting-item-description` class.
- `delay()` used a bare `setTimeout`. It now uses `globalThis.setTimeout`, which works both
  inside Obsidian and in the Node process the tests run it in.
- An unnecessary type assertion in the `spawn` wrapper.

### Changed

- The bundled Terminalogue Marp engine is vendored as
  `vendor/terminalogue-marp-engine.mjs` rather than resolved from a workspace package, so
  the plugin builds on its own, offline, and what ships is what is committed.
- Lint runs `eslint-plugin-obsidianmd`, the rule set Obsidian's community directory runs
  against a submission.

### Terminals in generated presentations

The engine this release embeds is Terminalogue 0.5.2, so a deck converted with it gains
everything Terminalogue gained since 0.4.0:

- `@size <columns>x<rows>` — a fixed terminal viewport, e.g. `@size 72x16`. A terminal
  occupies its final area from the first frame, so a slide's layout no longer shifts while
  the terminal types itself. Output taller than the rows scrolls inside the terminal.
- The `powershell` theme is 20% darker.

## 0.4.0

Terminalogue Presenter's first release, as part of Terminalogue 0.4.0.

### Added

- **Present current note** — converts the current Marp note with your own Marp CLI and
  opens the presentation in the default browser.
- **Present current note with watch** — the same, with Marp left running so that edits
  refresh the page.
- **Export current note to HTML** — writes the presentation into the vault, next to the
  note.
- **Stop presentation** — stops a running watch process.
- Settings for the Marp executable and for whether a finished presentation opens itself.
- `termlogue` blocks in a converted deck animate on the slide, using the Terminalogue
  engine embedded in the plugin — no `node_modules` beside the HTML, and no network.

### Notes

- Desktop only: the plugin runs Marp CLI as a separate program.
- It never installs, updates or downloads anything. Marp CLI is yours to install and to
  point the settings at.
