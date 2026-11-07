import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Los tests no pasan por acá: usan vitest.config.ts, que fija America/Montevideo.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Para abrirlo desde el celular en la red local durante la demo.
    host: true,
  },
});
