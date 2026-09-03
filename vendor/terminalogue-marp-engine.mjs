// @terminalogue/marp — self-contained Marp CLI engine. Generated; do not edit.

// ../core/src/duration.ts
var DURATION_RE = /^([0-9]+(?:\.[0-9]+)?)\s*(ms|s)$/i;
function parseDuration(raw) {
  const text = raw.trim();
  if (text === "") {
    return {
      ok: false,
      message: 'missing duration (expected a number followed by "ms" or "s", e.g. 500ms or 1.5s)'
    };
  }
  const match = DURATION_RE.exec(text);
  if (!match) {
    return {
      ok: false,
      message: `invalid duration "${text}" (expected a number followed by "ms" or "s", e.g. 500ms or 1.5s)`
    };
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `invalid duration "${text}" (not a finite number)` };
  }
  const ms = match[2].toLowerCase() === "s" ? value * 1e3 : value;
  return { ok: true, ms };
}

// ../core/src/size.ts
var TERMINAL_SIZE_LIMITS = {
  minColumns: 20,
  maxColumns: 240,
  minRows: 5,
  maxRows: 100
};
var SIZE_RE = /^([0-9]+)x([0-9]+)$/;
var { minColumns, maxColumns, minRows, maxRows } = TERMINAL_SIZE_LIMITS;
var TERMINAL_SIZE_RANGE = `columns must be between ${minColumns} and ${maxColumns}, rows between ${minRows} and ${maxRows}`;
var EXPECTED = "expected <columns>x<rows>, e.g. 80x24";
function parseTerminalSize(raw) {
  const text = raw.trim();
  if (text === "") {
    return { ok: false, message: `missing size (${EXPECTED})` };
  }
  const match = SIZE_RE.exec(text);
  if (!match) {
    return { ok: false, message: `invalid size "${text}" (${EXPECTED})` };
  }
  const columns = Number(match[1]);
  const rows = Number(match[2]);
  if (!inRange(columns, minColumns, maxColumns) || !inRange(rows, minRows, maxRows)) {
    return {
      ok: false,
      message: `terminal size "${text}" is out of range (${TERMINAL_SIZE_RANGE})`
    };
  }
  return { ok: true, size: { columns, rows } };
}
function inRange(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

// ../core/src/parser.ts
var DEFAULT_PROMPT = "$";
var TERMINALOGUE_THEMES = [
  "light",
  "dark",
  "ubuntu",
  "powershell",
  "cmd"
];
var DEFAULT_THEME = "dark";
function isTerminalogueTheme(value) {
  return TERMINALOGUE_THEMES.includes(value);
}
var THEME_LIST = TERMINALOGUE_THEMES.slice(0, -1).join(", ").concat(` and ${TERMINALOGUE_THEMES[TERMINALOGUE_THEMES.length - 1]}`);
var DIRECTIVE_RE = /^@([A-Za-z][A-Za-z0-9-]*)(?:[ \t]+(.*))?$/;
function parseTerminalogue(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const steps = [];
  const diagnostics = [];
  let title;
  let prompt = DEFAULT_PROMPT;
  let speedMs;
  let theme;
  let themeLine = 0;
  let size;
  let sizeLine = 0;
  const error = (line, message) => {
    diagnostics.push({ line, message, severity: "error" });
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;
    if (raw.startsWith("\\")) {
      const rest = raw.slice(1);
      const next = rest.charAt(0);
      steps.push(output(lineNumber, next === "$" || next === "@" || next === "\\" ? rest : raw));
      continue;
    }
    if (raw === "$" || raw.startsWith("$ ")) {
      steps.push(command(lineNumber, prompt, raw.slice(2).trimEnd(), speedMs));
      continue;
    }
    if (raw.startsWith("@")) {
      const match = DIRECTIVE_RE.exec(raw.trimEnd());
      if (!match) {
        error(
          lineNumber,
          `Malformed directive "${raw.trim()}". Directives look like "@name" or "@name value"; write "\\@" to start an output line with a literal "@".`
        );
        continue;
      }
      const name = match[1].toLowerCase();
      const argument = (match[2] ?? "").trim();
      switch (name) {
        case "title": {
          if (argument === "") {
            error(lineNumber, '@title expects a title, e.g. "@title Installing Nginx".');
            break;
          }
          title = argument;
          break;
        }
        case "prompt": {
          if (argument === "") {
            error(lineNumber, '@prompt expects a prompt string, e.g. "@prompt [root@server ~]#".');
            break;
          }
          prompt = argument;
          break;
        }
        case "theme": {
          if (argument === "") {
            error(
              lineNumber,
              `@theme expects a theme name, e.g. "@theme ubuntu". Supported themes are ${THEME_LIST}.`
            );
            break;
          }
          const requested = argument.toLowerCase();
          if (!isTerminalogueTheme(requested)) {
            error(
              lineNumber,
              `Unknown theme "${argument}". Supported themes are ${THEME_LIST}.`
            );
            break;
          }
          if (theme !== void 0) {
            error(
              lineNumber,
              `Duplicate @theme directive. A block has one theme: "${theme}" from line ${themeLine} is kept and "${requested}" here is ignored.`
            );
            break;
          }
          theme = requested;
          themeLine = lineNumber;
          break;
        }
        case "size": {
          const result = parseTerminalSize(argument);
          if (!result.ok) {
            error(lineNumber, `@size: ${result.message}.`);
            break;
          }
          if (size !== void 0) {
            error(
              lineNumber,
              `Duplicate @size directive. A block has one terminal size: "${size.columns}x${size.rows}" from line ${sizeLine} is kept and "${result.size.columns}x${result.size.rows}" here is ignored.`
            );
            break;
          }
          size = result.size;
          sizeLine = lineNumber;
          break;
        }
        case "wait": {
          const result = parseDuration(argument);
          if (!result.ok) {
            error(lineNumber, `@wait: ${result.message}.`);
            break;
          }
          steps.push(wait(lineNumber, result.ms));
          break;
        }
        case "speed": {
          const result = parseDuration(argument);
          if (!result.ok) {
            error(lineNumber, `@speed: ${result.message}.`);
            break;
          }
          if (result.ms <= 0) {
            error(lineNumber, `@speed: typing speed must be greater than 0, got "${argument}".`);
            break;
          }
          speedMs = result.ms;
          break;
        }
        case "type": {
          if (argument === "") {
            error(
              lineNumber,
              '@type expects the text to type, e.g. "@type yes"; a bare "@type" would type nothing at all.'
            );
            break;
          }
          steps.push(type(lineNumber, argument, speedMs));
          break;
        }
        case "pause": {
          steps.push(pause(lineNumber, argument === "" ? void 0 : argument));
          break;
        }
        case "clear": {
          if (argument !== "") {
            error(lineNumber, `@clear takes no arguments, but got "${argument}".`);
            break;
          }
          steps.push(clear(lineNumber));
          break;
        }
        default: {
          error(
            lineNumber,
            `Unknown directive "@${match[1]}". Supported directives are @title, @theme, @size, @prompt, @type, @wait, @pause, @speed and @clear.`
          );
          break;
        }
      }
      continue;
    }
    steps.push(output(lineNumber, raw));
  }
  return {
    ...title === void 0 ? {} : { title },
    theme: theme ?? DEFAULT_THEME,
    // Omitted rather than defaulted: no `@size` means automatic sizing, which
    // is a different thing from a size that happens to be the default one.
    ...size === void 0 ? {} : { size },
    steps: trimBlankEdges(steps),
    finalPrompt: prompt,
    diagnostics
  };
}
function trimBlankEdges(steps) {
  const isBlank = (step) => step !== void 0 && step.kind === "output" && step.text.trim() === "";
  let start = 0;
  let end = steps.length;
  while (start < end && isBlank(steps[start])) start++;
  while (end > start && isBlank(steps[end - 1])) end--;
  return steps.slice(start, end);
}
function command(line, prompt, text, speedMs) {
  return {
    kind: "command",
    line,
    prompt,
    command: text,
    ...speedMs === void 0 ? {} : { speedMs }
  };
}
function output(line, text) {
  return { kind: "output", line, text };
}
function type(line, text, speedMs) {
  return {
    kind: "type",
    line,
    text,
    ...speedMs === void 0 ? {} : { speedMs }
  };
}
function pause(line, label) {
  return { kind: "pause", line, ...label === void 0 ? {} : { label } };
}
function wait(line, ms) {
  return { kind: "wait", line, ms };
}
function clear(line) {
  return { kind: "clear", line };
}

// src/generated/assets.ts
var TERMINALOGUE_CSS = "/*\n * Terminalogue stylesheet.\n *\n * This file is the single source of truth for how a Terminalogue block looks.\n * It is copied verbatim into the VS Code extension (markdown.previewStyles) and\n * into the Obsidian plugin (styles.css) so both hosts render identically.\n *\n * Every visual property is set explicitly on Terminalogue's own elements so\n * that host stylesheets (VS Code's preview CSS, Obsidian themes) do not leak in.\n *\n * Themes\n * ------\n * There is one DOM structure and one set of rules. A theme is nothing but a\n * different set of values for the custom properties declared on `.tlg` below,\n * selected by the `data-theme` attribute the renderer writes from `@theme`.\n * No theme adds, removes, moves or restyles an element, and no theme changes\n * anything about playback \u2014 a theme is a palette and nothing more.\n *\n * `dark` is the base palette rather than an override: it is declared on `.tlg`\n * itself, so a block with no `@theme` and a block with `@theme dark` are the\n * same block, and every pre-theme document keeps the look it always had.\n */\n\n.tlg {\n  --tlg-bg: #101218;\n  --tlg-bg-chrome: #1a1d26;\n  --tlg-border: #2b2f3d;\n  --tlg-fg: #d6dbe6;\n  --tlg-fg-dim: #8b93a7;\n  --tlg-prompt: #7ee787;\n  --tlg-command: #f2f5fa;\n  --tlg-accent: #58a6ff;\n  --tlg-input: #ffd7a8;\n  --tlg-ok: #7ee787;\n  --tlg-danger: #ff7b72;\n  --tlg-danger-bg: #2a1b1c;\n  /* Foreground for text drawn on top of --tlg-accent, i.e. the chosen speed. */\n  --tlg-accent-fg: #0b1220;\n  --tlg-cursor: var(--tlg-fg);\n  /* Controls: resting colour, and how they lift on hover. */\n  --tlg-control-fg: var(--tlg-fg-dim);\n  --tlg-control-fg-hover: var(--tlg-fg);\n  --tlg-control-hover-bg: rgba(255, 255, 255, 0.08);\n  /* Window decoration. Purely decorative and aria-hidden. */\n  --tlg-dot-1: #ff5f57;\n  --tlg-dot-2: #febc2e;\n  --tlg-dot-3: #28c840;\n  /*\n   * The console mark the Windows themes wear instead of the dots. Unset here\n   * because only those themes show one; `--tlg-mark` is its glyph.\n   */\n  --tlg-mark: '';\n  --tlg-mark-bg: transparent;\n  --tlg-mark-fg: inherit;\n  --tlg-mark-border: transparent;\n  --tlg-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);\n  --tlg-radius: 10px;\n  --tlg-font:\n    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\",\n    monospace;\n  --tlg-font-size: 13px;\n  --tlg-line-height: 1.55;\n  --tlg-line-min-height: calc(var(--tlg-font-size) * var(--tlg-line-height));\n  /*\n   * Terminal metrics. One row is one line box \u2014 font size times line height,\n   * the same number `.tlg__line` uses as its minimum height \u2014 and one column is\n   * one `ch`, the width of a `0` in the terminal font. Every theme shares them:\n   * a theme re-values colours, and only `ubuntu`, `powershell` and `cmd` touch\n   * the corner radius, so `@size 80x24` is the same 80 by 24 characters in all\n   * five. The screen's own padding and the window border are named here too,\n   * because a fixed viewport has to add them back: `@size` counts the text\n   * area, not the box drawn around it.\n   */\n  --tlg-border-width: 1px;\n  --tlg-screen-padding-x: 14px;\n  --tlg-screen-padding-y: 12px;\n  /* How tall an automatically sized terminal may grow before it scrolls. */\n  --tlg-screen-max-height: 26em;\n\n  display: block;\n  box-sizing: border-box;\n  margin: 1em 0;\n  padding: 0;\n  border: var(--tlg-border-width) solid var(--tlg-border);\n  border-radius: var(--tlg-radius);\n  background: var(--tlg-bg);\n  color: var(--tlg-fg);\n  font-family: var(--tlg-font);\n  font-size: var(--tlg-font-size);\n  line-height: var(--tlg-line-height);\n  font-weight: 400;\n  font-style: normal;\n  text-align: left;\n  overflow: hidden;\n  box-shadow: var(--tlg-shadow);\n  -webkit-font-smoothing: antialiased;\n}\n\n.tlg *,\n.tlg *::before,\n.tlg *::after {\n  box-sizing: border-box;\n}\n\n/* ------------------------------------------------------------ theme tokens */\n\n/*\n * Each block below re-values the custom properties declared above and nothing\n * else. `dark` needs no block: it is the base palette.\n *\n * Contrast was checked for every theme, for body text, control text, the title\n * bar, the selected speed button and the focus outline. The selected speed and\n * the playback state are carried by aria-pressed and data-state as well as by\n * colour, so nothing here is the sole indication of a control's state.\n */\n\n/*\n * light \u2014 the counterpart to dark rather than an inversion of it: a paper-white\n * screen with near-black text, tuned for reading long stretches of output.\n */\n.tlg[data-theme='light'] {\n  --tlg-bg: #ffffff;\n  --tlg-bg-chrome: #eff1f4;\n  --tlg-border: #d3d8de;\n  --tlg-fg: #24292f;\n  --tlg-fg-dim: #57606a;\n  --tlg-prompt: #1a7f37;\n  --tlg-command: #0b1017;\n  --tlg-accent: #0969da;\n  --tlg-input: #9a3412;\n  --tlg-ok: #1a7f37;\n  --tlg-danger: #b42318;\n  --tlg-danger-bg: #fdf2f2;\n  --tlg-accent-fg: #ffffff;\n  --tlg-control-hover-bg: rgba(15, 20, 30, 0.08);\n  --tlg-shadow: 0 1px 2px rgba(16, 18, 24, 0.1);\n}\n\n/*\n * ubuntu \u2014 the deep aubergine screen and warm orange accent of Ubuntu's\n * terminal, drawn entirely in CSS: no logo, no image, no bundled font.\n */\n.tlg[data-theme='ubuntu'] {\n  --tlg-bg: #300a24;\n  --tlg-bg-chrome: #3c1030;\n  --tlg-border: #5b2149;\n  --tlg-fg: #eeeeec;\n  --tlg-fg-dim: #c5aabd;\n  --tlg-prompt: #8ae234;\n  --tlg-command: #ffffff;\n  --tlg-accent: #e95420;\n  --tlg-input: #fcaf3e;\n  --tlg-ok: #8ae234;\n  --tlg-danger: #ff8b7e;\n  --tlg-danger-bg: #45122c;\n  --tlg-accent-fg: #2c0018;\n  --tlg-control-hover-bg: rgba(255, 255, 255, 0.1);\n  --tlg-dot-1: #e95420;\n  --tlg-dot-2: #d19a7a;\n  --tlg-dot-3: #aea79f;\n  --tlg-radius: 8px;\n}\n\n/*\n * powershell \u2014 the classic Windows PowerShell console: solid blue screen,\n * near-white text, console yellow prompt and a plain, squared-off window.\n *\n * The whole palette is the console's own colours dimmed to 80%: every channel\n * of every colour multiplied by 0.8, so hue and saturation are untouched and\n * the theme keeps its relationships \u2014 it is the same console with the\n * brightness turned down, not a different one. Contrast was re-checked after\n * the change and every pair still clears WCAG AA by a wide margin: terminal\n * text 8.96:1, the window title 5.80:1, the selected speed 6.13:1, the\n * diagnostics box 5.87:1, and the focus outline and cursor 5.18:1 and 8.96:1\n * against the 3:1 non-text threshold.\n */\n.tlg[data-theme='powershell'] {\n  --tlg-bg: #011d45;\n  --tlg-bg-chrome: #012962;\n  --tlg-border: #10407e;\n  --tlg-fg: #bebec0;\n  --tlg-fg-dim: #98a8bd;\n  --tlg-prompt: #c7c184;\n  --tlg-command: #cccccc;\n  --tlg-accent: #4eabab;\n  --tlg-input: #cc9356;\n  --tlg-ok: #70ba82;\n  --tlg-danger: #cc7e7e;\n  --tlg-danger-bg: #051632;\n  --tlg-accent-fg: #011d45;\n  --tlg-control-hover-bg: rgba(255, 255, 255, 0.14);\n  /* The shell prompt itself: a deep-blue chip carrying `>_`. */\n  --tlg-mark: '>_';\n  --tlg-mark-bg: #011d45;\n  --tlg-mark-fg: #cccccc;\n  --tlg-mark-border: #10407e;\n  --tlg-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);\n  --tlg-radius: 4px;\n}\n\n/*\n * cmd \u2014 the classic Windows Command Prompt: black screen, silver text, bright\n * white for what was typed, and as little decoration as the markup allows.\n */\n.tlg[data-theme='cmd'] {\n  --tlg-bg: #000000;\n  --tlg-bg-chrome: #0c0c0c;\n  --tlg-border: #545454;\n  --tlg-fg: #c0c0c0;\n  --tlg-fg-dim: #a8a8a8;\n  --tlg-prompt: #ffffff;\n  --tlg-command: #ffffff;\n  --tlg-accent: #3b78ff;\n  --tlg-input: #ffffff;\n  --tlg-ok: #16c60c;\n  --tlg-danger: #e74856;\n  --tlg-danger-bg: #1c0b0c;\n  --tlg-accent-fg: #000000;\n  --tlg-control-hover-bg: rgba(255, 255, 255, 0.16);\n  /* A black console window showing a drive prompt. */\n  --tlg-mark: 'C:\\\\';\n  --tlg-mark-bg: #000000;\n  --tlg-mark-fg: #f2f2f2;\n  --tlg-mark-border: #8a8a8a;\n  --tlg-shadow: none;\n  --tlg-radius: 2px;\n}\n\n/* ---------------------------------------------------------------- title bar */\n\n.tlg__titlebar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px 10px;\n  margin: 0;\n  padding: 7px 10px;\n  border-bottom: 1px solid var(--tlg-border);\n  background: var(--tlg-bg-chrome);\n  min-height: 32px;\n}\n\n.tlg__dots {\n  display: inline-flex;\n  flex: 0 0 auto;\n  gap: 6px;\n  padding: 0 2px;\n}\n\n.tlg__dot {\n  display: block;\n  width: 9px;\n  height: 9px;\n  border-radius: 50%;\n  background: var(--tlg-dot-1);\n}\n\n.tlg__dot:nth-child(2) {\n  background: var(--tlg-dot-2);\n}\n.tlg__dot:nth-child(3) {\n  background: var(--tlg-dot-3);\n}\n\n/*\n * A small console badge: `>_` or `C:\\`, drawn in the terminal's own font.\n *\n * It stands in for the three dots on the themes whose terminal has no such\n * dots to begin with. It is CSS from end to end \u2014 a glyph in `content`, no\n * image, no icon font, no vendor logo \u2014 and it is hidden unless a theme opts\n * in below, so every other theme keeps its dots and its markup unchanged.\n */\n.tlg__mark {\n  display: none;\n  flex: 0 0 auto;\n  align-items: center;\n  height: 16px;\n  margin: 0;\n  padding: 0 4px;\n  border: 1px solid var(--tlg-mark-border);\n  border-radius: 3px;\n  background: var(--tlg-mark-bg);\n  color: var(--tlg-mark-fg);\n  font-family: var(--tlg-font);\n  font-size: calc(var(--tlg-font-size) - 2px);\n  font-weight: 700;\n  line-height: 1;\n  letter-spacing: 0.02em;\n  white-space: pre;\n  user-select: none;\n}\n\n.tlg__mark::before {\n  content: var(--tlg-mark);\n}\n\n/* The two themes that wear a console mark instead of the three dots. */\n.tlg[data-theme='powershell'] .tlg__dots,\n.tlg[data-theme='cmd'] .tlg__dots {\n  display: none;\n}\n\n.tlg[data-theme='powershell'] .tlg__mark,\n.tlg[data-theme='cmd'] .tlg__mark {\n  display: inline-flex;\n}\n\n.tlg__title {\n  flex: 1 1 6em;\n  min-width: 0;\n  margin: 0;\n  padding: 0;\n  color: var(--tlg-fg-dim);\n  font-family: var(--tlg-font);\n  font-size: calc(var(--tlg-font-size) - 1px);\n  font-weight: 500;\n  letter-spacing: 0.01em;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n/* --------------------------------------------------------------- breakpoint */\n\n/*\n * The label of the `@pause` currently holding playback. Empty \u2014 and so hidden \u2014\n * at every other moment, including a manual pause.\n */\n.tlg__breakpoint {\n  flex: 0 1 auto;\n  min-width: 0;\n  margin: 0;\n  padding: 1px 7px;\n  border: 1px solid var(--tlg-border);\n  border-radius: 999px;\n  background: var(--tlg-bg);\n  color: var(--tlg-fg-dim);\n  font-family: var(--tlg-font);\n  font-size: calc(var(--tlg-font-size) - 2px);\n  line-height: 1.5;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n/*\n * Collapsed rather than removed while there is nothing to say: a live region\n * has to already be in the accessibility tree for a screen reader to announce\n * the text that later appears in it.\n */\n.tlg__breakpoint:empty {\n  padding: 0;\n  border: 0;\n}\n\n/* ---------------------------------------------------------------- controls */\n\n/*\n * The controls sit in the title bar and wrap onto their own row when the\n * Markdown preview is narrow, which both hosts routinely are.\n */\n.tlg__controls {\n  display: inline-flex;\n  flex: 0 0 auto;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  margin-left: auto;\n}\n\n/* Speed buttons behave as one toggle group, so they are drawn as one. */\n.tlg__group {\n  display: inline-flex;\n  flex: 0 0 auto;\n  align-items: center;\n  gap: 2px;\n  margin: 0 2px;\n  padding: 2px;\n  border: 1px solid var(--tlg-border);\n  border-radius: 7px;\n}\n\n.tlg__button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 24px;\n  height: 24px;\n  margin: 0;\n  padding: 0;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--tlg-control-fg);\n  font: inherit;\n  line-height: 1;\n  cursor: pointer;\n  appearance: none;\n  -webkit-appearance: none;\n}\n\n.tlg__button:hover:not(:disabled) {\n  background: var(--tlg-control-hover-bg);\n  color: var(--tlg-control-fg-hover);\n}\n\n.tlg__button:focus-visible {\n  outline: 2px solid var(--tlg-accent);\n  outline-offset: 1px;\n}\n\n.tlg__button:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* Buttons that carry a word rather than only a glyph. */\n.tlg__speed,\n.tlg__copy {\n  width: auto;\n  gap: 4px;\n  padding: 0 7px;\n  font-family: var(--tlg-font);\n  font-size: calc(var(--tlg-font-size) - 2px);\n  font-weight: 500;\n  white-space: nowrap;\n}\n\n.tlg__speed {\n  height: 20px;\n}\n\n/*\n * The speed in effect. Marked up with aria-pressed as well, so the selected\n * speed is never carried by colour alone in any theme.\n */\n.tlg__speed[aria-pressed='true'],\n.tlg__speed[aria-pressed='true']:hover {\n  background: var(--tlg-accent);\n  color: var(--tlg-accent-fg);\n}\n\n.tlg__copy[data-copy='copied'] {\n  color: var(--tlg-ok);\n}\n\n.tlg__copy[data-copy='failed'] {\n  color: var(--tlg-danger);\n}\n\n.tlg__button-text {\n  display: inline-block;\n  color: inherit;\n  font: inherit;\n}\n\n.tlg__icon {\n  display: block;\n  width: 14px;\n  height: 14px;\n  pointer-events: none;\n}\n\n/* ------------------------------------------------------------------ screen */\n\n.tlg__body {\n  display: block;\n  margin: 0;\n  padding: 0;\n}\n\n.tlg__screen {\n  display: block;\n  margin: 0;\n  padding: var(--tlg-screen-padding-y) var(--tlg-screen-padding-x);\n  max-height: var(--tlg-screen-max-height);\n  overflow-x: auto;\n  overflow-y: auto;\n  /*\n   * The screen follows the newest line by moving its scroll position, which has\n   * to be instant: a terminal does not glide. Stated explicitly because a host\n   * page that turns smooth scrolling on globally would otherwise animate every\n   * character of a typing animation.\n   */\n  scroll-behavior: auto;\n  scrollbar-width: thin;\n}\n\n/* ---------------------------------------------------------- fixed viewport */\n\n/*\n * `@size <columns>x<rows>`: a terminal body of exactly that many characters.\n *\n * The renderer writes the two numbers into `--tlg-columns` and `--tlg-rows` and\n * marks the block with `data-size=\"fixed\"`; all the arithmetic is here, so a\n * document contributes numbers to this stylesheet and never text. A block\n * without `@size` matches none of these rules and keeps the automatic sizing it\n * has always had.\n *\n * Width belongs on the window rather than on the screen \u2014 a terminal narrower\n * than its own title bar would be an odd thing to look at \u2014 so the columns are\n * grown back out to the window's outer edge by adding the screen's padding and\n * the window border. `max-width` is what keeps a wide `@size` inside a narrow\n * Markdown preview or a Marp slide: the terminal gets narrower, the font does\n * not, and the existing wrapping takes it from there.\n *\n * Height belongs on the screen, which is what `rows` means: the title bar, the\n * diagnostics and the controls are all outside it and none of them counts. The\n * screen keeps its `overflow-y: auto`, so content taller than `rows` scrolls\n * inside the terminal exactly as it does in a real one, and the box around it\n * never moves.\n */\n.tlg[data-size='fixed'] {\n  /* What the window adds around its text area: the screen's padding and the border. */\n  --tlg-window-frame: calc(2 * var(--tlg-screen-padding-x) + 2 * var(--tlg-border-width));\n\n  width: calc(var(--tlg-columns) * 1ch + var(--tlg-window-frame));\n  max-width: 100%;\n}\n\n.tlg[data-size='fixed'] .tlg__screen {\n  height: calc(var(--tlg-rows) * var(--tlg-line-min-height) + 2 * var(--tlg-screen-padding-y));\n  max-height: none;\n}\n\n.tlg__line {\n  display: block;\n  margin: 0;\n  padding: 0;\n  min-height: var(--tlg-line-min-height);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  color: var(--tlg-fg);\n  font-family: var(--tlg-font);\n  font-size: var(--tlg-font-size);\n  line-height: var(--tlg-line-height);\n  tab-size: 4;\n}\n\n.tlg__line--command,\n.tlg__line--idle {\n  margin-top: 0.35em;\n}\n\n.tlg__line:first-child {\n  margin-top: 0;\n}\n\n.tlg__prompt {\n  color: var(--tlg-prompt);\n  font-weight: 600;\n  user-select: none;\n}\n\n.tlg__command {\n  color: var(--tlg-command);\n}\n\n/* Text typed by `@type` in answer to a prompt already on screen. */\n.tlg__input {\n  color: var(--tlg-input);\n}\n\n.tlg__cursor {\n  display: inline-block;\n  width: 0.6em;\n  height: 1.05em;\n  margin: 0;\n  padding: 0;\n  vertical-align: text-bottom;\n  background: var(--tlg-cursor);\n  animation: tlg-blink 1.05s steps(1, end) infinite;\n}\n\n@keyframes tlg-blink {\n  0%,\n  49% {\n    opacity: 1;\n  }\n  50%,\n  100% {\n    opacity: 0;\n  }\n}\n\n/* ------------------------------------------------------------- diagnostics */\n\n.tlg__diagnostics {\n  display: block;\n  margin: 0;\n  padding: 10px 14px;\n  border-top: 1px solid var(--tlg-border);\n  background: var(--tlg-danger-bg);\n  color: var(--tlg-danger);\n  font-family: var(--tlg-font);\n  font-size: calc(var(--tlg-font-size) - 1px);\n  line-height: 1.5;\n}\n\n.tlg__diagnostics-title {\n  margin: 0 0 4px;\n  padding: 0;\n  font-weight: 600;\n  color: var(--tlg-danger);\n}\n\n.tlg__diagnostics-list {\n  margin: 0;\n  padding: 0 0 0 1.1em;\n  list-style: disc;\n}\n\n.tlg__diagnostic {\n  margin: 0;\n  padding: 0;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n/* ------------------------------------------------------- accessibility only */\n\n.tlg__sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: -1px;\n  padding: 0;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  clip-path: inset(50%);\n  white-space: nowrap;\n  border: 0;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .tlg__cursor {\n    animation: none;\n  }\n}\n";
var TERMINALOGUE_BROWSER_SCRIPT = '"use strict";(()=>{var xe=Object.defineProperty;var ke=(t,e,n)=>e in t?xe(t,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[e]=n;var m=(t,e,n)=>ke(t,typeof e!="symbol"?e+"":e,n);var q={minColumns:20,maxColumns:240,minRows:5,maxRows:100};var{minColumns:J,maxColumns:X,minRows:Q,maxRows:ee}=q,ve=`columns must be between ${J} and ${X}, rows between ${Q} and ${ee}`;function A(t){if(typeof t!="object"||t===null)return!1;let{columns:e,rows:n}=t;return K(e,J,X)&&K(n,Q,ee)}function K(t,e,n){return typeof t=="number"&&Number.isInteger(t)&&t>=e&&t<=n}var M="$",P=["light","dark","ubuntu","powershell","cmd"],v="dark";function L(t){return P.includes(t)}var Ve=P.slice(0,-1).join(", ").concat(` and ${P[P.length-1]}`);function B(t){let e=[];for(let n of t.steps)switch(n.kind){case"command":e.push(te(n.prompt,n.command));break;case"output":e.push(n.text);break;case"type":{let r=e.length-1;r<0?e.push(n.text):e[r]=`${e[r]}${n.text}`;break}case"clear":e.length=0;break;case"wait":case"pause":break}return e.join(`\n`)}function te(t,e){return t===""?e:`${t} ${e}`}function j(t){let e=[];for(let n of t.steps)n.kind==="command"&&n.command!==""&&e.push(n.command);return e}var ne="http://www.w3.org/2000/svg";function a(t,e,n,r){let l=t.createElement(e);return n!==void 0&&(l.className=n),r!==void 0&&(l.textContent=r),l}function w(t,e,n){let r=t.createElementNS(ne,"svg");r.setAttribute("class",e),r.setAttribute("viewBox","0 0 16 16"),r.setAttribute("width","14"),r.setAttribute("height","14"),r.setAttribute("aria-hidden","true"),r.setAttribute("focusable","false");for(let l of n){let i=t.createElementNS(ne,"path");i.setAttribute("d",l.d),l.paint==="stroke"?(i.setAttribute("fill","none"),i.setAttribute("stroke","currentColor"),i.setAttribute("stroke-width","1.6"),i.setAttribute("stroke-linecap","round")):i.setAttribute("fill","currentColor"),r.appendChild(i)}return r}var re=[{d:"M5 3.2 L12.6 8 L5 12.8 Z"}],ie=[{d:"M4.6 3.4 h2.4 v9.2 h-2.4 Z"},{d:"M9 3.4 h2.4 v9.2 h-2.4 Z"}],oe=[{d:"M8 2.6 A5.4 5.4 0 1 0 13.4 8",paint:"stroke"},{d:"M8 0.4 L5.4 2.6 L8 4.8 Z"}],se=[{d:"M6.2 2.6 H13.4 V10.2 H10.4",paint:"stroke"},{d:"M2.6 5.8 H10.2 V13.4 H2.6 Z",paint:"stroke"}],ae=[{d:"M3.4 8.4 L6.5 11.5 L12.6 4.6",paint:"stroke"}];function _(t){for(;t.firstChild;)t.removeChild(t.firstChild)}var _e=new Set(["-","_","/",".",":","=",",",";","|"]);function le(t,e){let n=[],r=(o,p)=>{n.push({delay:Math.max(0,Math.round(o)),op:p})},l=(o,p)=>{let c=p??e.typingSpeed;for(let f of Array.from(o))r(Ce(f,c,e),{type:"type",char:f});r(e.commandSubmitDelay,{type:"submit"})};for(let o of t.steps)switch(o.kind){case"command":{r(e.outputLineDelay,{type:"command-start",prompt:o.prompt}),l(o.command,o.speedMs);break}case"type":{r(e.outputLineDelay,{type:"input-start"}),l(o.text,o.speedMs);break}case"output":r(e.outputLineDelay,{type:"output",text:o.text});break;case"wait":r(o.ms,{type:"noop"});break;case"clear":r(e.outputLineDelay,{type:"clear"});break;case"pause":n.push({delay:0,op:{type:"noop"},pause:o.label===void 0?{}:{label:o.label}});break}let i=n.find(o=>o.pause===void 0);return i&&(i.delay+=Math.round(e.startDelay)),n}function Ce(t,e,n){let{jitterMin:r,jitterMax:l,random:i}=n,o=Math.max(0,l-r),p=r+Ee(i())*o,c=t===" "?1.8:_e.has(t)?1.25:1;return e*p*c}function Ee(t){return!Number.isFinite(t)||t<0?0:t>1?1:t}var U=[1,2,4,"instant"],Ae={play:"Play terminal animation",pause:"Pause terminal animation",restart:"Restart terminal animation",speed:"Playback speed",speed1x:"1\\xD7",speed2x:"2\\xD7",speed4x:"4\\xD7",speedInstant:"Instant",copy:"Copy commands",copied:"Commands copied",copyFailed:"Could not copy commands",copyText:"Copy",copiedText:"Copied",copyFailedText:"Failed",transcript:"Terminal session transcript",terminal:"Animated terminal session",diagnostics:"Terminalogue could not parse this block",untitled:"Terminal"};function I(t){try{return t?.matchMedia?.("(prefers-reduced-motion: reduce)").matches===!0}catch{return!1}}function pe(t,e){let n=t??{};return{autoplay:n.autoplay??!0,autoplayOnVisible:n.autoplayOnVisible??!0,typingSpeed:De(n.typingSpeed,55),jitterMin:n.jitterMin??.65,jitterMax:n.jitterMax??1.35,random:n.random??Math.random,outputLineDelay:R(n.outputLineDelay,110),commandSubmitDelay:R(n.commandSubmitDelay,340),startDelay:R(n.startDelay,260),speed:Le(n.speed)?n.speed:1,copyFeedbackDelay:R(n.copyFeedbackDelay,1500),clipboard:n.clipboard??Pe(e),reducedMotion:n.reducedMotion??I(e),controls:n.controls??!0,labels:{...Ae,...n.labels}}}function ue(t,e){switch(t){case 1:return e.speed1x;case 2:return e.speed2x;case 4:return e.speed4x;case"instant":return e.speedInstant}}function Pe(t){return async e=>{let n=t?.navigator?.clipboard;if(typeof n?.writeText!="function")throw new Error("Terminalogue: the Clipboard API is unavailable in this host.");await n.writeText(e)}}function Le(t){return t===1||t===2||t===4||t==="instant"}function De(t,e){return typeof t=="number"&&Number.isFinite(t)&&t>0?t:e}function R(t,e){return typeof t=="number"&&Number.isFinite(t)&&t>=0?t:e}var O=class{constructor(e,n,r,l={}){m(this,"frames");m(this,"screen");m(this,"idlePrompt");m(this,"hooks");m(this,"index",0);m(this,"timer",null);m(this,"frameStartedAt",0);m(this,"remaining",null);m(this,"scheduledAt",1);m(this,"currentState","idle");m(this,"currentSpeed",1);m(this,"reason",null);m(this,"breakpoint",null);this.frames=e,this.screen=n,this.idlePrompt=r,this.hooks=l}get state(){return this.currentState}get speed(){return this.currentSpeed}get pauseReason(){return this.currentState==="paused"?this.reason:null}get pauseBreakpoint(){return this.currentState==="paused"&&this.reason==="directive"?this.breakpoint:null}play(){this.currentState==="destroyed"||this.currentState==="playing"||this.currentState!=="finished"&&(this.reason=null,this.breakpoint=null,this.setState("playing"),this.advance())}pause(){this.currentState==="playing"&&(this.suspend(),this.stopAt("manual",null))}restart(){this.currentState!=="destroyed"&&(this.stopTimer(),this.index=0,this.remaining=null,this.reason=null,this.breakpoint=null,this.screen.reset(),this.setState("idle"),this.play())}setSpeed(e){if(this.currentState==="destroyed"||this.currentSpeed===e)return;let n=this.currentState==="playing";n&&this.suspend(),this.currentSpeed=e,n&&this.advance()}seekToEnd(){if(this.currentState!=="destroyed"){for(this.stopTimer(),this.remaining=null;this.index<this.frames.length;)this.screen.apply(this.frames[this.index].op),this.index++;this.finish()}}destroy(){this.stopTimer(),this.setState("destroyed")}advance(){if(this.currentSpeed==="instant"){this.runInstant();return}let e=this.frames[this.index];if(e?.pause){this.apply(e);return}this.schedule()}schedule(){if(this.index>=this.frames.length){this.finish();return}let e=this.frames[this.index],n=this.remaining??e.delay;this.remaining=n,this.scheduledAt=this.currentSpeed,this.frameStartedAt=Date.now(),this.timer=setTimeout(()=>{this.timer=null,this.remaining=null,this.apply(e),this.currentState==="playing"&&this.advance()},this.scale(n))}runInstant(){for(this.stopTimer(),this.remaining=null;this.index<this.frames.length;){let e=this.frames[this.index];if(this.apply(e),this.currentState!=="playing")return}this.finish()}apply(e){this.screen.apply(e.op),this.index++,e.pause&&this.stopAt("directive",e.pause)}suspend(){let e=Date.now()-this.frameStartedAt,n=this.scheduledAt==="instant"?Number.POSITIVE_INFINITY:e*this.scheduledAt;this.remaining=Math.max(0,(this.remaining??0)-n),this.stopTimer()}stopAt(e,n){this.reason=e,this.breakpoint=n,this.setState("paused")}scale(e){return this.currentSpeed==="instant"?0:e/this.currentSpeed}finish(){this.currentState!=="finished"&&(this.reason=null,this.breakpoint=null,this.screen.showIdlePrompt(this.idlePrompt),this.setState("finished"))}stopTimer(){this.timer!==null&&(clearTimeout(this.timer),this.timer=null)}setState(e){this.currentState!==e&&(this.currentState=e,this.hooks.onStateChange?.(e))}};var N=class{constructor(e){m(this,"root");m(this,"doc");m(this,"cursor");m(this,"activeText",null);this.doc=e,this.root=a(e,"div","tlg__screen"),this.root.setAttribute("aria-hidden","true"),this.cursor=a(e,"span","tlg__cursor"),this.cursor.setAttribute("aria-hidden","true")}apply(e){switch(e.type){case"command-start":{let n=a(this.doc,"div","tlg__line tlg__line--command");e.prompt!==""&&(n.appendChild(a(this.doc,"span","tlg__prompt",e.prompt)),n.appendChild(this.doc.createTextNode(" ")));let r=a(this.doc,"span","tlg__command","");n.appendChild(r),n.appendChild(this.cursor),this.root.appendChild(n),this.activeText=r;break}case"input-start":{let n=this.root.lastElementChild??this.root.appendChild(a(this.doc,"div","tlg__line tlg__line--output","")),r=a(this.doc,"span","tlg__input","");n.appendChild(r),n.appendChild(this.cursor),this.activeText=r;break}case"type":{this.activeText&&(this.activeText.textContent+=e.char);break}case"submit":{this.activeText=null,this.detachCursor();break}case"output":{this.root.appendChild(a(this.doc,"div","tlg__line tlg__line--output",e.text));break}case"clear":{this.detachCursor(),_(this.root),this.activeText=null;break}case"noop":break}this.scrollToBottom()}showIdlePrompt(e){this.detachCursor();let n=a(this.doc,"div","tlg__line tlg__line--idle");e!==""&&(n.appendChild(a(this.doc,"span","tlg__prompt",e)),n.appendChild(this.doc.createTextNode(" "))),n.appendChild(this.cursor),this.root.appendChild(n),this.scrollToBottom()}reset(){this.detachCursor(),_(this.root),this.activeText=null,this.root.scrollTop=0}get text(){return Array.from(this.root.children).map(e=>e.textContent??"").join(`\n`)}detachCursor(){this.cursor.remove()}scrollToBottom(){this.root.scrollTop=this.root.scrollHeight}};function de(t,e,n){let r=t.ownerDocument,l=r.defaultView,i=pe(n,l),o=a(r,"div","tlg");o.setAttribute("data-state","idle");let p=L(e.theme)?e.theme:v;o.setAttribute("data-theme",p);let c=A(e.size)?e.size:null;c&&(o.setAttribute("data-size","fixed"),o.style.setProperty("--tlg-columns",String(c.columns)),o.style.setProperty("--tlg-rows",String(c.rows)));let f=new N(r),b=e.title??i.labels.untitled,x=j(e),C=Me(r,b);o.appendChild(C);let h=a(r,"div","tlg__body");h.appendChild(f.root),o.appendChild(h),e.diagnostics.length>0&&o.appendChild(we(r,e,i.labels.diagnostics)),o.appendChild(Re(r,e,`${i.labels.transcript}: ${b}`));let k=a(r,"span","tlg__breakpoint");k.setAttribute("role","status"),C.appendChild(k);let z=le(e,i),u=new O(z,f,e.finalPrompt,{onStateChange:s=>{o.setAttribute("data-state",s);let d=u.pauseReason;d===null?o.removeAttribute("data-pause-reason"):o.setAttribute("data-pause-reason",d),k.textContent=u.pauseBreakpoint?.label??"",G(s)}});u.setSpeed(i.speed);let $=!1,D=null,T=()=>{D?.disconnect(),D=null},y=null,S=null,E=null,W=new Map;function G(s){if(!y)return;let d=s==="playing";_(y),y.appendChild(w(r,"tlg__icon",d?ie:re)),y.setAttribute("aria-label",d?i.labels.pause:i.labels.play)}function F(){for(let[s,d]of W)d.setAttribute("aria-pressed",String(s===u.speed))}function H(s){if(!S)return;let g={idle:{label:i.labels.copy,text:i.labels.copyText},copied:{label:i.labels.copied,text:i.labels.copiedText},failed:{label:i.labels.copyFailed,text:i.labels.copyFailedText}}[s];_(S),S.appendChild(w(r,"tlg__icon",s==="copied"?ae:se)),S.appendChild(a(r,"span","tlg__button-text",g.text)),S.setAttribute("aria-label",g.label),S.setAttribute("data-copy",s)}function V(){E!==null&&(clearTimeout(E),E=null)}function Y(s){$||(V(),H(s),E=setTimeout(()=>{E=null,H("idle")},i.copyFeedbackDelay))}function Z(){return $||x.length===0?Promise.resolve(!1):Promise.resolve().then(()=>i.clipboard(x.join(`\n`))).then(()=>(Y("copied"),!0),()=>(Y("failed"),!1))}function Te(){let s=a(r,"div","tlg__group");s.setAttribute("role","group"),s.setAttribute("aria-label",i.labels.speed);for(let d of U){let g=a(r,"button","tlg__button tlg__speed",ue(d,i.labels));g.type="button",g.setAttribute("aria-pressed","false"),g.addEventListener("click",()=>{u.setSpeed(d),F()}),W.set(d,g),s.appendChild(g)}return s}function Se(){let s=a(r,"button","tlg__button tlg__copy");return s.type="button",s.addEventListener("click",()=>{Z()}),S=s,H("idle"),s.disabled=x.length===0,s}if(i.controls){let s=a(r,"div","tlg__controls");y=a(r,"button","tlg__button"),y.type="button",y.addEventListener("click",()=>{T(),u.state==="playing"?u.pause():u.state==="finished"?u.restart():u.play()});let d=a(r,"button","tlg__button");d.type="button",d.setAttribute("aria-label",i.labels.restart),d.appendChild(w(r,"tlg__icon",oe)),d.addEventListener("click",()=>{T(),u.restart()}),s.appendChild(y),s.appendChild(d),s.appendChild(Te()),s.appendChild(Se()),C.appendChild(s),G(u.state),F()}if(t.appendChild(o),i.reducedMotion)u.seekToEnd();else if(i.autoplay){let s=l?.IntersectionObserver;i.autoplayOnVisible&&typeof s=="function"?(D=new s(d=>{d.some(g=>g.isIntersecting)&&(T(),u.play())},{threshold:.2}),D.observe(o)):u.play()}return{element:o,get state(){return u.state},get pauseReason(){return u.pauseReason},get speed(){return u.speed},play(){T(),u.state==="finished"?u.restart():u.play()},pause(){T(),u.pause()},restart(){T(),u.restart()},setSpeed(s){u.setSpeed(s),F()},copyCommands:Z,destroy(){$=!0,T(),V(),u.destroy(),o.remove()}}}function Me(t,e){let n=a(t,"div","tlg__titlebar"),r=a(t,"span","tlg__dots");r.setAttribute("aria-hidden","true");for(let i=0;i<3;i++)r.appendChild(a(t,"span","tlg__dot"));n.appendChild(r);let l=a(t,"span","tlg__mark");return l.setAttribute("aria-hidden","true"),n.appendChild(l),n.appendChild(a(t,"span","tlg__title",e)),n}function we(t,e,n){let r=a(t,"div","tlg__diagnostics");r.setAttribute("role","group"),r.setAttribute("aria-label",n),r.appendChild(a(t,"p","tlg__diagnostics-title",n));let l=a(t,"ul","tlg__diagnostics-list");for(let i of e.diagnostics)l.appendChild(a(t,"li","tlg__diagnostic",`Line ${i.line}: ${i.message}`));return r.appendChild(l),r}function Re(t,e,n){let r=a(t,"div","tlg__transcript tlg__sr-only");return r.setAttribute("role","group"),r.setAttribute("aria-label",n),r.appendChild(a(t,"pre","tlg__transcript-text",B(e))),r}var ce="terminalogue-block",me="data-terminalogue";function he(t){if(typeof t!="string"||t==="")return null;let e;try{e=JSON.parse(decodeURIComponent(t))}catch{return null}if(typeof e!="object"||e===null)return null;let n=e;if(!Array.isArray(n.steps)||!n.steps.every(Oe))return null;let r=Array.isArray(n.diagnostics)?n.diagnostics.filter(Ne):[];return{...typeof n.title=="string"?{title:n.title}:{},theme:L(n.theme)?n.theme:v,...A(n.size)?{size:n.size}:{},steps:n.steps,finalPrompt:typeof n.finalPrompt=="string"?n.finalPrompt:M,diagnostics:r}}function fe(t){return{theme:v,steps:[],finalPrompt:M,diagnostics:[{line:1,message:t,severity:"error"}]}}var Ie=new Set(["command","output","type","wait","clear","pause"]);function Oe(t){if(typeof t!="object"||t===null)return!1;let e=t;return typeof e.kind=="string"&&Ie.has(e.kind)}function Ne(t){if(typeof t!="object"||t===null)return!1;let e=t;return typeof e.line=="number"&&typeof e.message=="string"&&(e.severity==="error"||e.severity==="warning")}var ze="bespoke-marp-slide",$e="bespoke-marp-active";function ge(t,e,n,r={}){let l=!1,i=!1,o=null,p=null,c=()=>{o?.disconnect(),o=null,p?.disconnect(),p=null},f=()=>{let h=t.closest(`.${ze}`);return h?h.classList.contains($e):i},b=()=>{l||!f()||(l=!0,c(),n())},x=e.MutationObserver;if(typeof x=="function"){let h=new x(b);h.observe(e.document.documentElement,{attributes:!0,attributeFilter:["class"],subtree:!0}),o=h}let C=()=>{if(l)return;let h=e.IntersectionObserver;if(typeof h!="function"){i=!0,b();return}let k=new h(z=>{z.some(u=>u.isIntersecting)&&(i=!0,b())},{threshold:.2});k.observe(t),p=k};return b(),l||(r.defer??(h=>Fe(e,h)))(C),c}function Fe(t,e){let n=()=>{let r=t.requestAnimationFrame?.bind(t);r?r(()=>r(e)):t.setTimeout(e,0)};t.document.readyState==="loading"?t.document.addEventListener("DOMContentLoaded",n,{once:!0}):n()}var He="Terminalogue could not read this block. The generated presentation may be incomplete.";function be(t,e={}){let n=t.document,r=new Map,l=e.reducedMotion??I(t),i=(p,c)=>{c.unwatch(),c.instance.destroy(),r.delete(p)},o=p=>{let c=he(p.getAttribute(me));for(;p.firstChild;)p.removeChild(p.firstChild);let f=de(p,c??fe(He),{autoplay:!1,reducedMotion:l}),b=l?je:ge(p,t,()=>Be(f),e);r.set(p,{instance:f,unwatch:b})};return{sync(){for(let[p,c]of Array.from(r))p.isConnected||i(p,c);for(let p of Array.from(n.querySelectorAll(`.${ce}`)))if(!r.has(p))try{o(p)}catch{}},get size(){return r.size},destroyAll(){for(let[p,c]of Array.from(r))i(p,c)}}}function Be(t){t.state==="idle"&&t.play()}function je(){}var ye="__terminalogueMarp__";function Ue(t){let e=t[ye];if(e){e.sync();return}let n=be(t);t[ye]=n,n.sync(),t.document.readyState==="loading"&&t.document.addEventListener("DOMContentLoaded",()=>n.sync(),{once:!0}),t.addEventListener("pagehide",()=>n.destroyAll(),{once:!0})}typeof window<"u"&&Ue(window);})();\n';

// src/placeholder.ts
var TERMINALOGUE_LANGUAGE = "termlogue";
var PLACEHOLDER_CLASS = "terminalogue-block";
var PAYLOAD_ATTRIBUTE = "data-terminalogue";
var THEME_ATTRIBUTE = "data-terminalogue-theme";
var SIZE_ATTRIBUTE = "data-terminalogue-size";
var RUNTIME_ELEMENT_ID = "terminalogue-marp-runtime";
var STYLE_ELEMENT_ID = "terminalogue-marp-style";
function fenceLanguage(info) {
  return info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}
function encodeDocument(document) {
  return encodeURIComponent(JSON.stringify(document));
}

// src/slide-css.ts
var TERMINALOGUE_SLIDE_CSS = `/* Terminalogue: slide-sized terminal (Marp only). */
.tlg {
  --tlg-font-size: 18px;
  margin: 0.6em 0;
}
`;

// src/markdown-it-plugin.ts
var ASSETS_TOKEN = "terminalogue_assets";
var ASSETS_RULE = "terminalogue_assets";
var STYLE_RULE = "terminalogue_style";
var MARPIT_STYLE_ASSIGN = "marpit_style_assign";
var REGISTERED = /* @__PURE__ */ Symbol.for("terminalogue.marp.registered");
function terminaloguePlugin(md) {
  const marked = md;
  if (marked[REGISTERED] === true) return;
  marked[REGISTERED] = true;
  registerFence(md);
  const styleIsMarpits = registerStyle(md);
  registerAssets(md, styleIsMarpits);
}
function registerFence(md) {
  const renderDefaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token && fenceLanguage(token.info) === TERMINALOGUE_LANGUAGE) {
      return renderPlaceholder(token.content);
    }
    return renderDefaultFence ? renderDefaultFence(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };
}
function registerStyle(md) {
  const rule = (state) => {
    if (state.inlineMode) return;
    if (!hasTerminalogueFence(state.tokens)) return;
    const token = new state.Token("marpit_style", "", 0);
    token.content = stylesheet();
    token.hidden = true;
    state.tokens.push(token);
  };
  try {
    md.core.ruler.before(MARPIT_STYLE_ASSIGN, STYLE_RULE, rule);
    return true;
  } catch {
    return false;
  }
}
function registerAssets(md, styleIsMarpits) {
  md.renderer.rules[ASSETS_TOKEN] = (tokens, index) => tokens[index]?.content ?? "";
  md.core.ruler.push(ASSETS_RULE, (state) => {
    if (state.inlineMode) return;
    if (!hasTerminalogueFence(state.tokens)) return;
    const token = new state.Token(ASSETS_TOKEN, "", 0);
    token.content = renderAssets(styleIsMarpits);
    state.tokens.push(token);
  });
}
function hasTerminalogueFence(tokens) {
  return tokens.some(
    (token) => token.type === "fence" && fenceLanguage(token.info) === TERMINALOGUE_LANGUAGE
  );
}
function stylesheet() {
  return `${TERMINALOGUE_CSS}
${TERMINALOGUE_SLIDE_CSS}`;
}
function renderPlaceholder(source) {
  const document = parseTerminalogue(source);
  const size = document.size;
  return `<div class="${PLACEHOLDER_CLASS}" ${THEME_ATTRIBUTE}="${document.theme}"` + // Two validated integers and an `x`, or nothing at all for an
  // automatically sized block.
  (size === void 0 ? "" : ` ${SIZE_ATTRIBUTE}="${size.columns}x${size.rows}"`) + ` ${PAYLOAD_ATTRIBUTE}="${encodeDocument(document)}"></div>
`;
}
function renderAssets(styleIsMarpits) {
  const style = styleIsMarpits ? "" : `<style id="${STYLE_ELEMENT_ID}">${TERMINALOGUE_CSS}
${TERMINALOGUE_SLIDE_CSS}</style>`;
  return `${style}<script id="${RUNTIME_ELEMENT_ID}">${TERMINALOGUE_BROWSER_SCRIPT}</script>
`;
}

// src/engine.ts
var terminalogueEngine = ({ marp }) => marp.use(terminaloguePlugin);
var engine_default = terminalogueEngine;
export {
  engine_default as default,
  terminalogueEngine
};
