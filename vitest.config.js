import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.js, whose root is the client folder.
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.js'],
    environment: 'node',
    fileParallelism: false,
  },
});
