/**
 * Just enough of Obsidian, Electron and Node to load the real built plugin and
 * run its commands.
 *
 * The point is to test the commands themselves — what they check, what they
 * say, and when the browser is opened — against the bundle that ships, rather
 * than against a re-implementation of it.
 */

export class Component {
  constructor() {
    this._children = [];
  }
  addChild(child) {
    this._children.push(child);
    return child;
  }
}

export function createObsidianStub() {
  const notices = [];
  /** Every confirm dialog that was opened, with the answer the test gives. */
  const modals = [];
  let confirmAnswer = true;

  class Notice {
    constructor(message) {
      notices.push(String(message));
    }
  }

  class Plugin extends Component {
    constructor() {
      super();
      this.commands = new Map();
      this.settingTabs = [];
      this._data = {};
    }
    addCommand(command) {
      this.commands.set(command.id, command);
      return command;
    }
    addSettingTab(tab) {
      this.settingTabs.push(tab);
    }
    async loadData() {
      return this._data;
    }
    async saveData(data) {
      this._data = data;
    }
  }

  class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = element();
    }
  }

  class Setting {
    constructor() {
      this.name = '';
      this.desc = '';
      this.components = [];
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDesc(desc) {
      this.desc = desc;
      return this;
    }
    addText(build) {
      const text = {
        value: '',
        setPlaceholder: () => text,
        setValue(value) {
          text.value = value;
          return text;
        },
        onChange(handler) {
          text.handler = handler;
          return text;
        },
      };
      build(text);
      this.components.push(text);
      return this;
    }
    addToggle(build) {
      const toggle = {
        setValue(value) {
          toggle.value = value;
          return toggle;
        },
        onChange(handler) {
          toggle.handler = handler;
          return toggle;
        },
      };
      build(toggle);
      this.components.push(toggle);
      return this;
    }
    addButton(build) {
      const button = {
        setButtonText(text) {
          button.text = text;
          return button;
        },
        setWarning: () => button,
        setDisabled: () => button,
        onClick(handler) {
          button.handler = handler;
          return button;
        },
      };
      build(button);
      this.components.push(button);
      return this;
    }
  }

  class Modal {
    constructor(app) {
      this.app = app;
      this.titleEl = element();
      this.contentEl = element();
    }
    open() {
      modals.push(this);
      this.onOpen?.();
      // The test's standing answer, delivered the way a click would deliver it.
      const buttons = this.contentEl._settings.flatMap((setting) => setting.components);
      const chosen = confirmAnswer ? buttons[1] : buttons[0];
      chosen?.handler?.();
    }
    close() {
      this.onClose?.();
    }
  }

  class MarkdownView {}
  class FileSystemAdapter {}
  class TFile {}

  /** A tiny stand-in for Obsidian's DOM helpers. */
  function element() {
    const node = {
      _settings: [],
      _text: '',
      style: {},
      empty() {},
      setText(text) {
        node._text = String(text);
      },
      createEl() {
        return element();
      },
      appendChild(child) {
        return child;
      },
    };
    return node;
  }

  // `new Setting(containerEl)` has to reach the container for the modal above.
  const SettingWithContainer = class extends Setting {
    constructor(containerEl) {
      super();
      containerEl?._settings?.push(this);
    }
  };

  return {
    notices,
    modals,
    answerConfirmWith(value) {
      confirmAnswer = value;
    },
    module: {
      Component,
      Notice,
      Plugin,
      PluginSettingTab,
      Setting: SettingWithContainer,
      Modal,
      MarkdownView,
      FileSystemAdapter,
      TFile,
    },
  };
}

/** An in-memory `node:fs`, so no test writes to a real temporary directory. */
export function createFsStub() {
  const files = new Map();
  const directories = new Set();

  const stats = (path) => {
    if (files.has(path)) {
      return { isFile: () => true, isDirectory: () => false, size: files.get(path).length, mtimeMs: 0 };
    }
    if (directories.has(path)) {
      return { isFile: () => false, isDirectory: () => true, size: 0, mtimeMs: Date.now() };
    }
    const error = new Error(`ENOENT: ${path}`);
    error.code = 'ENOENT';
    throw error;
  };

  return {
    files,
    directories,
    module: {
      mkdirSync(path) {
        directories.add(path);
      },
      writeFileSync(path, contents) {
        files.set(path, String(contents));
      },
      readdirSync(path) {
        const prefix = `${path}`;
        const names = new Set();
        for (const directory of directories) {
          if (directory.startsWith(prefix) && directory !== prefix) {
            const rest = directory.slice(prefix.length).replace(/^[\\/]/, '');
            if (rest !== '') names.add(rest.split(/[\\/]/)[0]);
          }
        }
        return [...names];
      },
      statSync: stats,
      rmSync(path) {
        for (const directory of [...directories]) {
          if (directory === path || directory.startsWith(path)) directories.delete(directory);
        }
        for (const file of [...files.keys()]) {
          if (file.startsWith(path)) files.delete(file);
        }
      },
    },
  };
}
