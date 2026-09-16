import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El front corre en 5173 y delega /api al servidor de desarrollo (scripts/dev-server.ts),
// que monta exactamente los mismos handlers que la funcion de Netlify usa en produccion.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Si 3001 ya esta ocupado: `API_PORT=3011 npm run dev` alinea proxy y API.
        target: `http://localhost:${process.env.API_PORT ?? 3001}`,
        changeOrigin: true,
      },
    },
  },
})
