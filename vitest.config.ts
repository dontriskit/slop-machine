import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['html', 'lcov', 'json', 'text'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: [
        'worker/src/game/services/**/*.ts',
        'worker/src/durable-objects/**/*.ts',
        'worker/src/agents/**/*.ts',
        'worker/src/solana/**/*.ts',
        'worker/src/game/formulas/**/*.ts',
        'worker/src/game/defenses.ts',
        'worker/src/game/formulas.ts',
      ],
      exclude: [
        'worker/src/game/services/index.ts',
        'worker/src/game/index.ts',
        '**/*.d.ts',
        '**/node_modules/**',
      ],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 60,
        statements: 70,
        perFile: false,
      },
    },
  },
});
