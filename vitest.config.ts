import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    alias: {
      // VS Code extension host is not available in the test environment —
      // use a minimal hand-rolled mock so pure logic tests can run without F5.
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
    },
  },
});
