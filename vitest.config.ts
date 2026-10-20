import { defineConfig, configDefaults } from 'vitest/config';

// Windows-path suites that assert win32 behaviour (drive letters, .exe resolution,
// registry verbs). Skipped off Windows only; Windows runs everything. Linux
// equivalents belong in new *.linux.test.ts files.
const WIN32_ONLY = [
  'tests/unit/config-loader.test.ts',
  'tests/unit/explorer-fs.test.ts',
  'tests/unit/explorer-roots.test.ts',
  'tests/unit/grok-context.test.ts',
  'tests/unit/node-runtime.test.ts',
  'tests/unit/opencode-plugin.test.ts',
  'tests/unit/pty-ledger.test.ts',
  'tests/unit/pty-manager.test.ts',
  'tests/unit/remote-upload.test.ts',
  'tests/unit/shell-context-menu.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: process.platform === 'win32' ? configDefaults.exclude : [...configDefaults.exclude, ...WIN32_ONLY],
    testTimeout: 15000,
  },
});
