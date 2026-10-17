/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** chave pública do push (npm run setup:push) */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** Google OAuth Client ID */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
