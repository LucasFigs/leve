import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em arquivos próprios: atualizações do app não invalidam o cache delas
        manualChunks: { react: ['react', 'react-dom'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
});
