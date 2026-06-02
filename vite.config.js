import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend API server. Keep in sync with PORT in the root .env (default 7700).
const BACKEND = 'http://localhost:7700'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 7701,
    strictPort: true, // fail loudly if 7701 is taken rather than silently picking another port
    proxy: {
      '/auth': BACKEND,
      '/contacts': BACKEND,
      '/campaigns': BACKEND,
      '/sendgrid': BACKEND,
    },
  },
})
