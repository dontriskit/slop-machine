import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['html', 'lcov', 'json', 'text'],
      reportsDirectory: './coverage',
      include: ['worker/src/**/*.ts'],
      exclude: [
        'worker/src/**/*.d.ts',
        'worker/src/index.ts',
        'frontend/**',
        'tests/**',
        'node_modules/**',
      ],
    },
  },
});
