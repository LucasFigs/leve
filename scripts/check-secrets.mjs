// Só informa arquivo/commit e tipo de achado; nunca imprime credenciais.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const git = (...args) => {
  try {
    return execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error('Não foi possível ler o Git para a verificação; saída omitida para não expor dados.');
  }
};
let findings = 0;
function inspect(name, source) {
  const types = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) types.push('private-key');
  if (/\bsbp_[a-zA-Z0-9]{20,}\b/.test(source) || /\bsb_secret_[a-zA-Z0-9_-]{20,}\b/.test(source)) types.push('supabase-private-token');
  for (const match of source.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') types.push('service-role-jwt'); } catch { /* não é JWT */ }
  }
  if (/\b(?:VAPID_PRIVATE_KEY|PUSH_CRON_SECRET|GOOGLE_CLIENT_SECRET|GOOGLE_TOKEN_ENCRYPTION_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*["']?[A-Za-z0-9_-]{24,}/.test(source)) types.push('private-env-value');
  if (types.length) { findings++; console.error(`${name}: ${[...new Set(types)].join(', ')}`); }
}
for (const file of new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))) {
  try { inspect(file, readFileSync(resolve(root, file), 'utf8')); } catch { /* arquivo removido */ }
}
// Opcionais: bundle gerado e todos os blobs alcançáveis no histórico.
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) walk(path);
    else if (/\.(js|html|json|css|map)$/.test(path)) inspect(path, readFileSync(path, 'utf8'));
  }
}
if (process.argv.includes('--dist')) walk(resolve(root, 'dist'));
if (process.argv.includes('--history')) {
  for (const line of git('rev-list', '--objects', '--all').trim().split('\n')) {
    const space = line.indexOf(' ');
    if (space < 0) continue;
    const hash = line.slice(0, space);
    if (git('cat-file', '-t', hash).trim() !== 'blob') continue;
    inspect(`histórico ${hash.slice(0, 12)} ${line.slice(space + 1)}`, git('cat-file', 'blob', hash));
  }
}
console.log(findings ? `${findings} arquivos/blobs com possíveis segredos. Revise e rotacione credenciais confirmadas.` : 'Nenhum segredo reconhecido pelos padrões verificados.');
process.exitCode = findings ? 1 : 0;
