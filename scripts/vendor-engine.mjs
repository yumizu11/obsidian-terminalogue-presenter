import { copyFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Refreshes the vendored Terminalogue Marp engine from a Terminalogue checkout.
 *
 *   node scripts/vendor-engine.mjs G:/code/Terminalogue
 *
 * The engine is the one thing this plugin does not write itself: it is the
 * bundle `@terminalogue/marp` builds, and it is what gives a converted deck its
 * animated terminals. Vendoring it — rather than depending on the package —
 * keeps this repository buildable on its own, and keeps what ships identical to
 * what is committed here.
 *
 * Run `pnpm build` in the Terminalogue repository first: this copies the built
 * engine, it does not build one.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/vendor-engine.mjs <path-to-Terminalogue-checkout>');
  process.exit(1);
}

const from = resolve(source, 'packages/marp/dist/terminalogue-marp-engine.mjs');
const to = resolve(root, 'vendor/terminalogue-marp-engine.mjs');

let built;
try {
  built = statSync(from);
} catch {
  console.error(`No engine at ${from}.\nRun "pnpm build" in the Terminalogue checkout first.`);
  process.exit(1);
}

copyFileSync(from, to);
console.log(`[vendor] engine -> ${to} (${built.size} B)`);
console.log('Rebuild and run the tests before releasing: npm run check');
