# Terminalogue Presenter

**Turn a Marp note into an HTML presentation — with terminals that type themselves.**

Terminalogue Presenter takes the note you are looking at, converts it with
[Marp CLI](https://github.com/marp-team/marp-cli), and opens the result in your default
browser. Any ` ```termlogue ` block in the deck becomes an animated terminal session:
commands typed one character at a time, output arriving line by line, playable and pausable
on the slide.

It is the presentation half of [Terminalogue](https://github.com/yumizu11/Terminalogue),
whose Obsidian plugin renders those same blocks in Reading View.

````markdown
---
marp: true
---

# Installing Nginx

```termlogue
@theme ubuntu
@size 72x16
@prompt [root@rhel10 ~]#

$ dnf install -y nginx
Updating repositories...
Complete!
```
````

> **Commands are never executed.** A `termlogue` block is prose that looks like a shell
> session — see [Security](#security).

## Requirements

- **Obsidian Desktop.** The plugin is `isDesktopOnly` because it runs Marp CLI as a
  separate program, which the mobile app cannot do.
- **Marp CLI, installed by you.** This plugin never installs, updates or downloads
  anything; it only runs the Marp you already have. Install it however you prefer, for
  example `npm install -g @marp-team/marp-cli` or `scoop install marp`, then check the path
  in the plugin's settings.

## Commands

| Command | What it does |
| --- | --- |
| **Present current note** | Converts the note and opens the presentation in your browser. |
| **Present current note with watch** | The same, and keeps Marp running so edits refresh the page. |
| **Export current note to HTML** | Writes the presentation next to the note, inside your vault. |
| **Stop presentation** | Stops a running watch process. |

## Settings

- **Marp executable** — the path to Marp CLI. Leave it empty to look for `marp` on `PATH`.
  Set it explicitly when Obsidian was started from a launcher, because a launcher's `PATH`
  is often not the shell's.
- **Open browser automatically** — whether a finished presentation opens itself.

## What this plugin does outside your vault

Obsidian asks plugins to say this plainly, and it is worth knowing:

- **It writes outside the vault.** *Present current note* generates the presentation into a
  new directory under your system temporary directory, one per session, and cleans up
  after itself. Nothing is written into the vault, because a generated HTML file and its
  assets are build output rather than notes. *Export current note to HTML* is the exception,
  and it is opt-in: it writes into the vault, next to the note, because that is what
  exporting means.
- **It starts one program: your Marp CLI.** The executable named in the settings, with the
  note's path and the output path as arguments. It is started directly, never through a
  shell, and never with anything a note contains as an argument.
- **It opens your browser** on the generated file, using the operating system's default
  handler.
- **It makes no network requests**, sends no telemetry, and needs no account. The generated
  presentation is self-contained: the Terminalogue stylesheet and runtime are inlined into
  the HTML, so a deck works offline, on a plane, from a USB stick.

## Security

**Nothing in a `termlogue` block is ever executed** — not by this plugin, not by Marp, not
by the generated presentation. A block is text that is drawn to look like a terminal.

The one program this plugin starts is the Marp CLI its settings name. It is spawned with
`shell: false`, with the executable and its arguments kept separate, so no path and no note
content is ever interpreted as a shell command. On Windows an npm-installed `marp.cmd` is
launched through `cmd.exe` — Node refuses to spawn `.cmd` directly — with every argument
quoted individually, and arguments containing quotes or newlines are refused rather than
escaped.

## Building it yourself

```bash
npm install
npm run check    # build, lint, typecheck, test
npm run build
```

`vendor/terminalogue-marp-engine.mjs` is the Terminalogue Marp engine, vendored: it is the
bundle [`@terminalogue/marp`](https://github.com/yumizu11/Terminalogue) builds, embedded
into `main.js` as a string and written to a scratch directory when a presentation is
generated. That is what lets a deck's terminals animate without Marp needing anything
installed alongside it. Refresh it from a Terminalogue checkout with:

```bash
node scripts/vendor-engine.mjs ../Terminalogue
```

Lint includes [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin),
the rule set the community directory runs against a submission, so `npm run lint` is the
same check the review makes.

## License

MIT. See [LICENSE](LICENSE).
