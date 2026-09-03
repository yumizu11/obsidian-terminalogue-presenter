import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the built plugin into an Obsidian vault for manual testing:
 *
 *   node apps/obsidian-presenter/scripts/deploy.mjs "/path/to/vault"
 *
 * or set the OBSIDIAN_VAULT environment variable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const vault = process.argv[2] ?? process.env.OBSIDIAN_VAULT;
if (!vault) {
  console.error('Usage: node scripts/deploy.mjs <path-to-obsidian-vault>');
  process.exit(1);
}

if (!existsSync(resolve(vault, '.obsidian'))) {
  console.error(`Not an Obsidian vault (no .obsidian folder): ${vault}`);
  process.exit(1);
}

const target = resolve(vault, '.obsidian/plugins/terminalogue-presenter');
mkdirSync(target, { recursive: true });

for (const file of ['main.js', 'manifest.json']) {
  const from = resolve(root, file);
  if (!existsSync(from)) {
    console.error(`Missing ${file}. Run "pnpm --filter terminalogue-obsidian-presenter build" first.`);
    process.exit(1);
  }
  copyFileSync(from, resolve(target, file));
}

console.log(`[terminalogue-presenter] installed into ${target}`);
console.log('Reload Obsidian, then enable Terminalogue Presenter under Settings > Community plugins.');
console.log('Terminalogue Presenter needs Obsidian Desktop and a Marp CLI installation.');
