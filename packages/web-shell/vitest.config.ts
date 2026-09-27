import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { BRAND_DEFINE } from './brand-define';

// Tests assert en-US numbers and UTC dates. The workers inherit this
// environment, so a machine in another locale or time zone runs the same
// suite as CI does.
process.env['TZ'] = 'UTC';
process.env['LC_ALL'] = 'en_US.UTF-8';
process.env['LANG'] = 'en_US.UTF-8';

export default defineConfig({
  root: 'client',
  define: BRAND_DEFINE,
  resolve: {
    alias: {
      '@organizaone/o1-code-web-shell/daemon-react-sdk': resolve(
        __dirname,
        './client/daemon-react-sdk.ts',
      ),
      '@organizaone/o1-code-web-shell/transcript': resolve(
        __dirname,
        './client/transcript.ts',
      ),
      '@': resolve(__dirname, './client'),
    },
  },
  test: {
    setupFiles: ['./test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    reporters: [
      'default',
      ['junit', { suiteName: '@organizaone/o1-code-web-shell' }],
    ],
    outputFile: {
      junit: '../junit.xml',
    },
    // RPC-timeout exemption; see scripts/tests/unit-vitest-configs.test.ts.
    dangerouslyIgnoreUnhandledErrors: process.platform !== 'linux',
    coverage: {
      // Same switch as cli/core: only the post-merge main run collects it.
      enabled: process.env['O1CODE_CI_COVERAGE'] === '1',
      provider: 'v8',
      reportsDirectory: '../coverage',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/test/**',
        '**/e2e/**',
        '**/*.d.ts',
        'vite-env.d.ts',
      ],
    },
  },
});
