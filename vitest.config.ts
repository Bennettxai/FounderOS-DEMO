import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Pages/components use the automatic JSX runtime (no `import React`), same as
  // Next builds them — without this, importing a *.tsx page throws
  // "React is not defined" under the classic runtime.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Hermetic creds: .env.local is a live credential store read fresh at call
    // time (lib/creds.ts), so tests must never see Alex's real file. Tests
    // that exercise the store point this at their own tmp path.
    env: {
      FOUNDER_OS_ENV_LOCAL: path.resolve(__dirname, 'tests', '.env.local.does-not-exist'),
    },
  },
});
