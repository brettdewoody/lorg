import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'src/shared'),
      '@functions': path.resolve(rootDir, 'netlify/functions'),
    },
  },
  server: { port: 5173 },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
})
