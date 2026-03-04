import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/user': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api\/user/, '/api'),
      },
      '/api/v1': {
        target: 'http://localhost:8000',
      },
      '/static': {
        target: 'http://localhost:8000',
      },
    },
  },
})
