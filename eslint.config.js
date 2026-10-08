/**
 * @license
 * Copyright 2025 Google LLC
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import checkFile from 'eslint-plugin-check-file';
import noCoreRootBarrelImport, {
  CORE_BARREL_SPECIFIERS,
} from './eslint-rules/no-core-root-barrel-import.js';
import noUtilsUpwardImport from './eslint-rules/no-utils-upward-import.js';
import noCoreUtilsUpwardImport from './eslint-rules/no-core-utils-upward-import.js';
import { legacyFilenames } from './eslint.legacy-filenames.mjs';
import { legacyCoreBarrelImports } from './eslint.legacy-core-barrel-imports.mjs';
import noConfigObjectCreate from './eslint-rules/no-config-object-create.js';

// General syntax restrictions applied to every TS/TSX source file. Hoisted so
// surface-specific overrides (flat config keeps only the last
// no-restricted-syntax setting per file) can repeat them without drift.
const generalRestrictedSyntaxSelectors = [
  {
    selector: 'CallExpression[callee.name="require"]',
    message: 'Avoid using require(). Use ES6 imports instead.',
  },
  {
    selector: 'ThrowStatement > Literal:not([value=/^\\w+Error:/])',
    message:
      'Do not throw string literals or non-Error objects. Throw new Error("...") instead.',
  },
];

// Undeclared imports are checked in shipped sources only: tests resolve
// shared tooling such as vitest from the root manifest by design.
const extraneousDependencyTestFiles = [
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
  '**/__tests__/**',
  '**/test/**',
  '**/tests/**',
];
const extraneousDependencyOptions = {
  devDependencies: true,
  optionalDependencies: true,
  peerDependencies: true,
};

export default tseslint.config(
  {
    // Global ignores
    ignores: [
      'node_modules/*',
      'packages/**/dist/**',
      'packages/web-templates/src/generated/**',
      // Generated UTS #39 confusables table (6.5k-entry literal): the
      // type-aware rules OOM the eslint heap on it, and generated data
      // has no idiom to enforce. Regenerate via
      // packages/web-shell/scripts/generate-confusables.mjs.
      'packages/web-shell/client/utils/unicodeConfusables.ts',
      // Vendored third-party code, copied as built (see its README).
      'packages/core/vendor/**',
      'integrations/**/dist/**',
      'bundle/**',
      'package/bundle/**',
      '.integration-tests/**',
      'packages/**/.integration-test/**',
      'dist/**',
      'demo/**/dist/**',
      '.o1-code/**',
      // Local autonomous-round state and scratch (git-ignored, not code).
      'ops/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'], // Add this if you are using React 17+
  {
    // Settings for eslint-plugin-react
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Import specific config
    files: ['packages/cli/src/**/*.{ts,tsx}'], // Target only TS/TSX in the cli package
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: true,
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      'import/no-default-export': 'warn',
      'import/no-unresolved': 'off', // Disable for now, can be noisy with monorepos/paths
      'import/namespace': 'off', // Disabled due to https://github.com/import-js/eslint-plugin-import/issues/2866
    },
  },
  {
    // ACP integration and the daemon are separate runtime surfaces that happen
    // to share a package directory. ACP may consume neutral contracts under
    // `runtime/`, but never `serve/` implementation modules.
    files: ['packages/cli/src/acp-integration/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/serve', '**/serve/**'],
              message:
                'acp-integration must not import serve/ internals. Put shared, lifecycle-free logic in packages/cli/src/runtime/ instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // `utils/` is the leaf layer that every other directory imports, so it
    // must not import back up into a domain directory. Type-only imports are
    // exempt: they are erased at compile time and cannot create a runtime
    // cycle.
    files: ['packages/cli/src/utils/**/*.{ts,tsx}'],
    plugins: {
      architecture: {
        rules: {
          'no-utils-upward-import': noUtilsUpwardImport,
        },
      },
    },
    rules: {
      'architecture/no-utils-upward-import': 'error',
    },
  },
  {
    // General overrides and rules for the project (TS/TSX files)
    files: [
      'packages/**/src/**/*.{ts,tsx}',
      'integrations/**/src/**/*.{ts,tsx}',
    ],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: true,
      },
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // We use TypeScript for React components; prop-types are unnecessary
      'react/prop-types': 'off',
      // General Best Practice Rules (subset adapted for flat config)
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      'arrow-body-style': ['error', 'as-needed'],
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as' },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-inferrable-types': [
        'error',
        { ignoreParameters: true, ignoreProperties: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'import/no-internal-modules': [
        'error',
        {
          allow: [
            // The vendored o1-connect library: one module, copied as built.
            '**/vendor/o1-connect/lib.mjs',
            'react-dom/test-utils',
            'react-dom/client',
            'memfs/lib/volume.js',
            'mime/lite',
            'yargs/**',
            'msw/node',
            '**/generated/**',
            './styles/tailwind.css',
            './styles/App.css',
            './styles/style.css'
          ],
        },
      ],
      'import/no-relative-packages': 'error',
      'no-cond-assign': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-restricted-syntax': ['error', ...generalRestrictedSyntaxSelectors],
      'no-unsafe-finally': 'error',
      'no-console': 'error',
      'no-unused-expressions': 'off', // Disable base rule
      '@typescript-eslint/no-unused-expressions': [
        // Enable TS version
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-arrow-callback': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      radix: 'error',
      'default-case': 'error',
    },
  },
  {
    // A package must declare what its own sources import. npm and the hoisted
    // pnpm layout both resolve a sibling's or the root's dependency, so a
    // missing declaration stays invisible until the package is installed on
    // its own — the check an isolated node_modules layout would add. Type-only
    // imports are exempt because they disappear at build time.
    files: [
      'packages/**/src/**/*.{ts,tsx}',
      'integrations/**/src/**/*.{ts,tsx}',
      // web-shell is published and keeps its shipped sources in client/, not
      // src/, so the globs above reach none of it.
      'packages/web-shell/client/**/*.{ts,tsx}',
    ],
    ignores: extraneousDependencyTestFiles,
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        extraneousDependencyOptions,
      ],
    },
  },
  {
    // export-html and insight carry a package.json only for "type" and their
    // build script; web-templates declares what they import.
    files: ['packages/web-templates/src/**/*.{ts,tsx}'],
    ignores: extraneousDependencyTestFiles,
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        {
          ...extraneousDependencyOptions,
          packageDir: `${import.meta.dirname}/packages/web-templates`,
        },
      ],
    },
  },
  {
    // The rule itself exempts tests, __tests__, and fixtures; repeating that
    // here would give the exemption two sources of truth. The utils-upward
    // rule self-scopes to packages/core/src/utils production files, so it can
    // share this block without redefining the architecture plugin.
    files: ['packages/core/src/**/*.{ts,tsx}'],
    plugins: {
      architecture: {
        rules: {
          'no-core-root-barrel-import': noCoreRootBarrelImport,
          'no-core-utils-upward-import': noCoreUtilsUpwardImport,
        },
      },
    },
    rules: {
      'architecture/no-core-root-barrel-import': 'error',
      'architecture/no-core-utils-upward-import': 'error',
    },
  },
  {
    // Importing a value from core's package root evaluates all of core in
    // every test whose import graph reaches the importing file, which is
    // where most cli test time goes. Type-only imports are erased
    // and stay allowed. Files that predate this rule are listed in
    // eslint.legacy-core-barrel-imports.mjs; drop an entry when migrating it.
    files: ['packages/cli/src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.{test,spec}.{ts,tsx}',
      '**/__tests__/**',
      '**/fixtures/**',
      ...legacyCoreBarrelImports,
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [...CORE_BARREL_SPECIFIERS].map((name) => ({
            name,
            allowTypeImports: true,
            message:
              "Import from the core module that defines the symbol, e.g. '@organizaone/o1-code-core/utils/debugLogger.js'. The package root evaluates all of core in every test that reaches this file.",
          })),
        },
      ],
    },
  },
  {
    // no-restricted-imports only sees static import/export declarations, so a
    // dynamic `await import('../serve/...')` would slip past the serve/
    // guard above. Kept after the general TS block because flat config applies only
    // the last no-restricted-syntax setting per file, hence the repeated
    // general selectors.
    files: ['packages/cli/src/acp-integration/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...generalRestrictedSyntaxSelectors,
        {
          // \x2f is '/' — esquery selector regexes cannot contain a literal '/'.
          selector: "ImportExpression[source.value=/(^|\\x2f)serve(\\x2f|$)/i]",
          message:
            'acp-integration must not dynamically import serve/ internals. Put shared, lifecycle-free logic in packages/cli/src/runtime/ instead.',
        },
      ],
    },
  },
  {
    files: [
      'packages/web-shell/client/**/*.{ts,tsx}',
      'packages/web-shell/*.config.ts',
    ],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: true,
      },
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      'react/prop-types': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'object-shorthand': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    files: ['packages/web-shell/client/daemon/**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['debug', 'warn', 'error'] }],
    },
  },
  {
    files: [
      'packages/web-shell/client/**/*.test.{ts,tsx}',
      'packages/web-shell/client/test/**/*.{ts,tsx}',
    ],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.vitest,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': 'off',
      'vitest/no-commented-out-tests': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['packages/web-shell/client/e2e/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: [
      'packages/core/src/config/config.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/__tests__/**',
      '**/generated/**',
      '**/*.generated.ts',
    ],
    plugins: {
      'o1-code': {
        rules: {
          'no-config-object-create': noConfigObjectCreate,
        },
      },
    },
    rules: {
      'o1-code/no-config-object-create': 'error',
    },
  },
  {
    // Enforce kebab-case filenames
    files: ['packages/core/src/**/*.ts', 'packages/cli/src/**/*.ts'],
    ignores: legacyFilenames.flatMap((name) => [
      `**/${name}.ts`,
      `**/${name}.*.ts`,
    ]),
    plugins: {
      'check-file': checkFile,
    },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.ts': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  {
    files: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/**/test/**/*.test.{ts,tsx}',
      'integrations/**/src/**/*.test.{ts,tsx}',
    ],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': 'off',
      'vitest/no-commented-out-tests': 'off',
      'no-console': 'off', // Allow console in tests
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: [
      'packages/**/src/**/*.test.{ts,tsx}',
      'integrations/**/src/**/*.test.{ts,tsx}',
      'packages/core/src/agents/runtime/agent-core-test-mock.ts',
    ],
    rules: {
      // Vitest constructor mocks require constructable functions, not arrows.
      'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
    },
  },
  // extra settings for scripts that we run directly with node
  {
    files: [
      './scripts/**/*.js',
      './scripts/**/*.mjs',
      'esbuild.config.js',
      'packages/*/scripts/**/*.js',
      'packages/*/scripts/**/*.mjs',
      'packages/*/build.mjs',
      // web-templates' export-html template build scripts also run with `node`.
      'packages/*/src/export-html/*.mjs',
      // Verification reproducer scripts under docs/ also run with `node`.
      'docs/**/*.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // Allow console in scripts
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        module: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },

  // ==================== no-console allowlist ====================
  // The following files/packages are allowed to use console.*

  // VS Code IDE companion - out of scope for no-console rule
  {
    files: ['packages/vscode-ide-companion/**/*.ts', 'packages/vscode-ide-companion/**/*.tsx', 'packages/vscode-ide-companion/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  // Specific CLI files that intentionally wrap console usage
  {
    files: [
      'packages/cli/src/acp-integration/acpAgent.ts',      // console infrastructure for ACP mode
      'packages/cli/src/utils/stdioHelpers.ts',            // wraps console.clear()
    ],
    rules: { 'no-console': 'off' },
  },
  // Specific esbuild configs not covered by scripts pattern
  {
    files: ['packages/vscode-ide-companion/esbuild.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
  // Settings for web-templates assets
  {
    files: [
      'packages/web-templates/src/**/*.{js,jsx,ts,tsx}',
      'packages/web-templates/*.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-console': 'off',
      'no-undef': 'off',
    },
  },
  // Prettier config must be last
  prettierConfig,
  // extra settings for scripts that we run directly with node
  {
    files: ['./integration-tests/**/*.{js,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // Allow console in integration tests
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
