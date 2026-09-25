import { defineConfig } from 'vite';

// Relative base so the built aquarium can be hosted from any sub-path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
