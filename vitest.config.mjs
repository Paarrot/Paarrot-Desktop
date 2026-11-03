import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The default pattern would also pick up the Electron spec in tests/e2e.
    include: ['tests/unit/**/*.test.js'],
  },
});
