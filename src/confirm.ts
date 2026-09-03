import { Modal, Setting, type App } from 'obsidian';

/**
 * A yes/no question, asked the way Obsidian asks one.
 *
 * Export writes a real file into the vault, so replacing one the reader
 * already has is a decision they make, not one the command makes for them.
 */

export interface ConfirmOptions {
  title: string;
  body: string;
  /** Face of the button that goes ahead. */
  confirmText: string;
}

export function confirm(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value: boolean): void => {
      if (answered) return;
      answered = true;
      resolve(value);
    };

    const modal = new (class extends Modal {
      override onOpen(): void {
        this.titleEl.setText(options.title);
        this.contentEl.createEl('p', { text: options.body });

        new Setting(this.contentEl)
          .addButton((button) =>
            button.setButtonText('Cancel').onClick(() => {
              answer(false);
              this.close();
            }),
          )
          .addButton((button) =>
            button
              .setButtonText(options.confirmText)
              // setDestructive() replaces this on recent Obsidian, but the
              // manifest supports 1.4.0, where setWarning is the API that
              // exists. It is deprecated there, not removed.
              .setWarning()
              .onClick(() => {
                answer(true);
                this.close();
              }),
          );
      }

      override onClose(): void {
        this.contentEl.empty();
        // Dismissing the dialog is a "no", however it was dismissed.
        answer(false);
      }
    })(app);

    modal.open();
  });
}
