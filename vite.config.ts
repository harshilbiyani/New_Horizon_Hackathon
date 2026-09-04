import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5191,
    watch: {
      ignored: [
        '**/simulation/**',
        '**/drone_swarm/**',
        '**/logs/**',
        '**/*.py',
        '**/*.pyc',
        '**/__pycache__/**',
        '**/*.json',
        '**/*.jsonl',
        '**/*.md',
        '**/.*/**',
      ]
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
})
