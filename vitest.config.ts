import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['html', 'lcov', 'json', 'text'],
      reportsDirectory: './coverage',
      include: [
        'worker/src/**/*.ts',
      ],
      exclude: [
        'worker/src/index.ts',
        'worker/src/db/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/node_modules/**',
      ],
      // Thresholds based on passing tests only (22/25 test files pass).
      // NOTE: moon.test.ts, moonBuildings.test.ts, and tournament.test.ts
      // have pre-existing failures unrelated to coverage setup.
      // Run: npm run coverage:passing — to generate report from passing tests.
      // Run: npm run coverage — to run full suite (includes known failing tests).
    },
  },
});
