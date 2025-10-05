import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
const maybeTsconfigPaths = await import('vite-tsconfig-paths').then(
  (mod) => mod.default,
  () => undefined,
)

export default defineConfig({
  plugins: [react(), maybeTsconfigPaths?.()].filter(Boolean),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/tests/setup.ts'],
    css: false,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
