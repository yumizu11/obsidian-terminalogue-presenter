import js from '@eslint/js';
import globals from 'globals';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

/**
 * Lint is where Obsidian's plugin review is answered before it is asked.
 *
 * `eslint-plugin-obsidianmd` is the rule set the community directory runs
 * against a submission, so a failure here is a failure there. It is worth the
 * dependency: a rejected review costs a version bump and another wait, and the
 * rule that caught this project once — inline styles in a settings tab — would
 * have been a five-second fix if it had been a lint error first.
 *
 * Its recommended config brings its own typescript-eslint setup, including the
 * type-checked rules, so this file adds the type information those need rather
 * than a second copy of the same configs.
 */

/** Assigning user content as markup is how a plugin becomes an XSS hole. */
const NO_MARKUP_SINKS = {
  selector:
    'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/], ' +
    'CallExpression[callee.property.name="write"][callee.object.name="document"]',
  message: 'Build DOM with createEl and textContent, never from markup.',
};

/** Obsidian rejects styles set from JavaScript: a theme cannot restyle them. */
const NO_INLINE_STYLES = {
  selector:
    'AssignmentExpression[left.object.property.name="style"], ' +
    'CallExpression[callee.object.property.name="style"][callee.property.name="setProperty"], ' +
    'CallExpression[callee.property.name="setAttribute"][arguments.0.value="style"]',
  message:
    'Use a CSS class, or setCssProps for a dynamic value; Obsidian rejects plugins ' +
    'that set styles from JavaScript.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'dist-release/**',
      'main.js',
      'src/generated/**',
      // The vendored Terminalogue Marp engine: another repository's build
      // artefact, shipped verbatim.
      'vendor/**',
    ],
  },

  js.configs.recommended,

  ...obsidianmd.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
      'prefer-const': 'error',
    },
  },

  {
    // The type-checked rules obsidianmd enables need a program to consult.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-syntax': ['error', NO_MARKUP_SINKS, NO_INLINE_STYLES],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    rules: {
      /*
       * Two rules this plugin cannot follow, for reasons that are not going to
       * change:
       *
       * The declarative settings API arrived in Obsidian 1.13; the manifest
       * supports 1.4.0, and a settings tab that only works on the newest
       * version is worse than one that works everywhere.
       *
       * "Marp" is a product name — the sentence-case rule reads it as an
       * ordinary word and asks for "marp", which would be wrong in every place
       * the name appears.
       */
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
      'obsidianmd/ui/sentence-case': 'off',
    },
  },

  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: globals.node },
    /*
     * Build scripts and tests are not shipped, and the plugin rules are about
     * what runs inside Obsidian: a build script that prints what it wrote is
     * doing its job, and a deploy script for a development vault knows where
     * that vault keeps its plugins.
     */
    rules: {
      'obsidianmd/rule-custom-message': 'off',
      'obsidianmd/prefer-window-timers': 'off',
      'obsidianmd/hardcoded-config-path': 'off',
    },
  },
);
