// Configura o projeto Supabase a partir daqui: cria a tabela e ajusta o login.
// Uso: npm run setup:supabase   (lê .env.local)
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.VITE_SUPABASE_URL;
const token = env.SUPABASE_ACCESS_TOKEN;
// Aceita "meuapp.vercel.app" ou "https://meuapp.vercel.app/" — normaliza para https://meuapp.vercel.app
const rawSite = (env.APP_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
const siteUrl = /^https?:\/\//.test(rawSite) ? rawSite : `https://${rawSite}`;

if (!url || url.includes('SEU-PROJETO')) throw new Error('Preencha VITE_SUPABASE_URL no .env.local');
if (!token || !token.startsWith('sbp_')) throw new Error('Preencha SUPABASE_ACCESS_TOKEN (começa com sbp_) no .env.local');

const ref = new URL(url).hostname.split('.')[0];
const api = (path, method, body) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`);
    return text;
  });

console.log(`Projeto: ${ref}`);

await api('/database/query', 'POST', { query: readFileSync('supabase/schema.sql', 'utf8') });
console.log('✓ Tabela "records", segurança (RLS) e tempo real configurados');

const redirects = [...new Set([siteUrl, 'http://localhost:5173', 'http://localhost:4173'])];
const auth = { site_url: siteUrl, uri_allow_list: redirects.map((u) => `${u}/**`).join(',') };

const googleId = env.GOOGLE_CLIENT_ID;
const googleSecret = env.GOOGLE_CLIENT_SECRET;
if (googleId && googleSecret) {
  Object.assign(auth, { external_google_enabled: true, external_google_client_id: googleId, external_google_secret: googleSecret });
}
await api('/config/auth', 'PATCH', auth);
console.log(`✓ Login configurado (site: ${siteUrl})`);
console.log(
  googleId && googleSecret
    ? '✓ Login com Google ativado'
    : `• Google: preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para ativar.
  URI de redirecionamento para o Google Cloud: ${url}/auth/v1/callback`,
);

console.log('\nPronto! Rode "npm run dev" e crie sua conta no app.');
