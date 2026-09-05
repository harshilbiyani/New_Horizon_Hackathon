import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const proxyConfig = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('error', (err, _req, res) => {
        if (res && !res.headersSent && res.writeHead) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Backend Gateway Unavailable', detail: err.message }));
        }
      });
    },
  },
  '/socket.io': {
    target: 'http://localhost:3001',
    ws: true,
    configure: (proxy) => {
      proxy.on('error', () => {});
    },
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    entries: ['src/**/*.{ts,tsx}'],
  },
  server: {
    port: 5191,
    watch: {
      ignored: [
        '**/simulation/**',
        '**/drone_swarm/**',
        '**/logs/**',
        '**/data/**',
        '**/*.py',
        '**/*.pyc',
        '**/__pycache__/**',
        '**/*.json',
        '**/*.jsonl',
        '**/*.md',
        '**/.*/**',
      ]
    },
    proxy: proxyConfig,
  },
  preview: {
    port: 5191,
    host: true,
    proxy: proxyConfig,
  }
})
