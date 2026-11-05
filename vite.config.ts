import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Auditorias locais não carregam .env nem credenciais do ambiente de desenvolvimento.
  envDir: process.env.LEVE_ISOLATED_CHECKS === '1' ? './.audit-no-env' : undefined,
  plugins: [react()],
  server: { host: '127.0.0.1' },
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em arquivos próprios: atualizações do app não invalidam o cache delas
        manualChunks: { react: ['react', 'react-dom'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
});
