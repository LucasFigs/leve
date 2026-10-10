// Configura os lembretes por push (notificação com o app fechado) no seu projeto Supabase.
// Uso: npm run setup:push            (lê e completa o .env.local)
//      npm run setup:push -- --bundle (só gera supabase/functions/send-reminders/index.ts, sem tocar no Supabase)
//
// O que ele faz: gera as chaves do push (uma vez), cria as tabelas, publica a função que envia
// os avisos e agenda a execução a cada minuto.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { build } from 'esbuild';

const FN = 'send-reminders';
const FN_DIR = `supabase/functions/${FN}`;
const bundleOnly = process.argv.includes('--bundle');

/* ---------- 1) Função num arquivo só (junta as regras de src/domain) ---------- */
const out = await build({
  entryPoints: [`${FN_DIR}/source.ts`],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  write: false,
  logLevel: 'error',
});
const code = `// GERADO por \`npm run setup:push\` a partir de source.ts — não edite à mão.\n// @ts-nocheck\n${out.outputFiles[0].text}`;
writeFileSync(`${FN_DIR}/index.ts`, code);
console.log(`✓ Função empacotada (${Math.round(code.length / 1024)} KB)`);
if (bundleOnly) process.exit(0);

/* ---------- 2) Configuração local ---------- */
const readEnv = () =>
  Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
let env = readEnv();

const url = env.VITE_SUPABASE_URL;
const token = env.SUPABASE_ACCESS_TOKEN;
if (!url || url.includes('SEU-PROJETO')) throw new Error('Preencha VITE_SUPABASE_URL no .env.local');
if (!token || !token.startsWith('sbp_')) {
  throw new Error('Preencha SUPABASE_ACCESS_TOKEN (começa com sbp_) no .env.local — crie em https://supabase.com/dashboard/account/tokens');
}

// Chaves do push: geradas uma vez só. Trocar as chaves cancela as inscrições dos aparelhos.
if (!env.VITE_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.PUSH_CRON_SECRET) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  appendFileSync(
    '.env.local',
    [
      '',
      '# --- Lembretes por push (gerado por npm run setup:push; não apague nem troque) ---',
      '# Chave pública: também vai na Vercel',
      `VITE_VAPID_PUBLIC_KEY=${raw.toString('base64url')}`,
      '# Chave privada e segredo do agendamento: NUNCA na Vercel nem no git',
      `VAPID_PRIVATE_KEY=${privateKey.export({ format: 'jwk' }).d}`,
      `PUSH_CRON_SECRET=${randomBytes(24).toString('base64url')}`,
      '',
    ].join('\n'),
  );
  env = readEnv();
  console.log('✓ Chaves do push geradas e salvas no .env.local');
} else console.log('✓ Chaves do push já existem no .env.local (mantidas)');

const rawSite = (env.APP_URL || '').trim().replace(/\/+$/, '');
const site = /^https:\/\//.test(rawSite) ? rawSite : rawSite && !rawSite.includes('localhost') ? `https://${rawSite.replace(/^http:\/\//, '')}` : '';
// Contato exigido pelo protocolo de push (endereço do app ou e-mail)
const subject = env.PUSH_CONTACT || site || `mailto:admin@${new URL(url).hostname}`;

const ref = new URL(url).hostname.split('.')[0];
const base = `https://api.supabase.com/v1/projects/${ref}`;
const api = async (path, method, body) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  return text;
};
console.log(`Projeto: ${ref}`);

/* ---------- 3) Tabelas ---------- */
await api('/database/query', 'POST', { query: readFileSync('supabase/push.sql', 'utf8') });
console.log('✓ Tabelas de inscrição e de avisos enviados criadas');

/* ---------- 4) Segredos da função ---------- */
await api('/secrets', 'POST', [
  { name: 'VAPID_PUBLIC_KEY', value: env.VITE_VAPID_PUBLIC_KEY },
  { name: 'VAPID_PRIVATE_KEY', value: env.VAPID_PRIVATE_KEY },
  { name: 'VAPID_SUBJECT', value: subject },
  { name: 'CRON_SECRET', value: env.PUSH_CRON_SECRET },
]);
console.log('✓ Segredos gravados no Supabase');

/* ---------- 5) Publica a função ---------- */
const form = new FormData();
form.append('metadata', JSON.stringify({ name: FN, entrypoint_path: 'index.ts', verify_jwt: false }));
form.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts');
const dep = await fetch(`${base}/functions/deploy?slug=${FN}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
if (!dep.ok) {
  console.error(`✗ Não consegui publicar a função pela API (${dep.status}): ${await dep.text()}`);
  console.error(`  Publique pelo terminal e rode este script de novo:
  npx supabase login
  npx supabase functions deploy ${FN} --no-verify-jwt --project-ref ${ref}`);
  process.exit(1);
}
console.log(`✓ Função "${FN}" publicada`);

/* ---------- 6) Agenda: a cada minuto ---------- */
const fnUrl = `${url.replace(/\/+$/, '')}/functions/v1/${FN}`;
const headers = JSON.stringify({ 'Content-Type': 'application/json', 'x-cron-secret': env.PUSH_CRON_SECRET });
await api('/database/query', 'POST', {
  query: `
    select cron.unschedule(jobid) from cron.job where jobname = 'leve-reminders';
    select cron.schedule(
      'leve-reminders',
      '* * * * *',
      $cron$ select net.http_post(url := '${fnUrl}', headers := '${headers}'::jsonb, body := '{}'::jsonb) $cron$
    );`,
});
console.log('✓ Agendamento a cada minuto criado');

/* ---------- 7) Teste ---------- */
await new Promise((r) => setTimeout(r, 3000));
const test = await fetch(fnUrl, { method: 'POST', headers: JSON.parse(headers), body: '{}' });
const result = await test.text();
if (test.ok) console.log(`✓ Função respondeu: ${result}`);
else console.error(`✗ A função respondeu ${test.status}: ${result}\n  Veja os logs em Supabase → Edge Functions → ${FN} → Logs.`);

console.log(`
Falta só 1 passo, na Vercel (Settings → Environment Variables), e depois um novo deploy:

  VITE_VAPID_PUBLIC_KEY=${env.VITE_VAPID_PUBLIC_KEY}

Depois, em cada aparelho: abra o app → Perfil → Lembretes → ligue “Avisar antes do horário”.
(No iPhone, o app precisa estar instalado na tela inicial.)`);
