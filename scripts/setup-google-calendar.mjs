// Prepara/publica somente a integração persistente. Nunca imprime credenciais.
// Sem --apply: valida a configuração e empacota em memória, sem alterações remotas.
import { appendFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_][A-Z_0-9]*=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim()]; }));
for (const name of ['VITE_SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'APP_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) if (!env[name]) throw new Error(`Preencha ${name} no .env.local.`);
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.VITE_SUPABASE_URL)) throw new Error('URL do Supabase inválida.');
const origin = new URL(env.APP_URL).origin;
if (origin !== env.APP_URL || !origin.startsWith('https://')) throw new Error('APP_URL deve ser uma origem HTTPS exata, sem barra final/caminho.');
if (env.VITE_GOOGLE_CLIENT_ID && env.VITE_GOOGLE_CLIENT_ID !== env.GOOGLE_CLIENT_ID) throw new Error('Os IDs de cliente Google estão diferentes. Confira antes de publicar.');
if (env.GOOGLE_TOKEN_ENCRYPTION_KEY && !/^[A-Za-z0-9_-]{43}$/.test(env.GOOGLE_TOKEN_ENCRYPTION_KEY)) throw new Error('Chave de criptografia inválida. Não troque uma chave já usada em produção.');
const output = await build({ entryPoints: ['supabase/functions/google-calendar/index.ts'], bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'error' });
const code = output.outputFiles[0].text;
console.log('Configuração local válida e Edge Function empacotada. Nenhum segredo será exibido.');
console.log(`Origem do aplicativo: ${origin}`);
console.log(`Cadastre no cliente OAuth Google: ${env.VITE_SUPABASE_URL}/functions/v1/google-calendar/callback`);
if (!process.argv.includes('--apply')) {
  console.log('Nenhuma alteração remota. Depois de configurar o Google Cloud, execute npm run setup:google -- --apply.');
  process.exit(0);
}
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const base = `https://api.supabase.com/v1/projects/${ref}`;
async function api(path, body) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Configuração interrompida: ${path} HTTP ${response.status}. Resposta omitida para proteger credenciais.`);
  return response;
}
const capability = await api('/database/query', { query: "select current_setting('transaction_read_only') as read_only", read_only: false });
if ((await capability.json())[0]?.read_only !== 'off') throw new Error('A credencial do Supabase permite somente leitura SQL. Atualize SUPABASE_ACCESS_TOKEN com permissão database_write antes de ativar. Nenhuma tabela foi criada.');
// Não recriar silenciosamente uma chave perdida em uma instalação já existente.
const check = await api('/database/query', { query: "select count(*)::int as total from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'google_calendar_connections'", read_only: true });
const result = await check.json();
if (result[0]?.total && !env.GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error('A integração já existe e a chave local está ausente. Recupere a chave original do armazenamento seguro antes de continuar.');
if (result[0]?.total && !process.argv.includes('--existing-key-confirmed')) {
  throw new Error('A tabela já existe. Confirme que GOOGLE_TOKEN_ENCRYPTION_KEY é a chave original e repita com --existing-key-confirmed.');
}
if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
  appendFileSync('.env.local', `\n# Exclusiva do servidor Google Agenda: preserve para decifrar os vínculos salvos.\nGOOGLE_TOKEN_ENCRYPTION_KEY=${env.GOOGLE_TOKEN_ENCRYPTION_KEY}\n`);
  console.log('Chave de criptografia criada no arquivo local ignorado pelo Git. Guarde uma cópia segura.');
}
await api('/database/query', { query: readFileSync('supabase/google-calendar.sql', 'utf8'), read_only: false });
console.log('Tabelas da integração e restrições de acesso aplicadas.');
await api('/secrets', [
  { name: 'GOOGLE_CLIENT_ID', value: env.GOOGLE_CLIENT_ID },
  { name: 'GOOGLE_CLIENT_SECRET', value: env.GOOGLE_CLIENT_SECRET },
  { name: 'GOOGLE_TOKEN_ENCRYPTION_KEY', value: env.GOOGLE_TOKEN_ENCRYPTION_KEY },
  { name: 'GOOGLE_APP_ORIGIN', value: origin },
]);
const form = new FormData();
// Callback OAuth público; todos os POSTs verificam JWT em /auth/v1/user e origem.
form.append('metadata', JSON.stringify({ name: 'google-calendar', entrypoint_path: 'index.ts', verify_jwt: false }));
form.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts');
const deployed = await fetch(`${base}/functions/deploy?slug=google-calendar`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(60000) });
if (!deployed.ok) throw new Error(`Publicação da função falhou: HTTP ${deployed.status}. Nenhuma resposta sensível exibida.`);
console.log('Edge Function publicada. Publique o frontend atualizado na Vercel e conecte o Google uma vez pelo Perfil.');
