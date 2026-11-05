$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$root = Split-Path -Parent $PSScriptRoot
$config = @{}
Get-Content -LiteralPath (Join-Path $root '.env.local') | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=(.*)$') { $config[$matches[1]] = $matches[2].Trim() }
}
$url = $config['VITE_SUPABASE_URL']
if ($url -notmatch '^https://([a-z0-9-]+)\.supabase\.co/?$') { throw 'URL Supabase inválida.' }
$projectRef = $matches[1]
$headers = @{ Authorization = 'Bearer ' + $config['SUPABASE_ACCESS_TOKEN'] }
$base = "https://api.supabase.com/v1/projects/$projectRef"
function Read-Api($path, $body = $null) {
  try {
    if ($null -eq $body) { return Invoke-RestMethod -Uri ($base + $path) -Headers $headers -Method Get -TimeoutSec 60 }
    return Invoke-RestMethod -Uri ($base + $path) -Headers $headers -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 100 -Compress))) -TimeoutSec 60
  } catch { throw "Falha ao copiar $path; detalhes omitidos para proteger os dados." }
}
$query = @'
select jsonb_build_object(
  'records', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.records r),
  'push_subscriptions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.push_subscriptions r),
  'push_sent', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.push_sent r),
  'policies', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from pg_policies p where schemaname='public' and tablename in ('records','push_subscriptions','push_sent')),
  'grants', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from information_schema.role_table_grants g where table_schema='public' and table_name in ('records','push_subscriptions','push_sent')),
  'columns', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from information_schema.columns c where table_schema='public' and table_name in ('records','push_subscriptions','push_sent')),
  'constraints', (select coalesce(jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'definition',pg_get_constraintdef(oid))), '[]') from pg_constraint where conrelid in ('public.records'::regclass,'public.push_subscriptions'::regclass,'public.push_sent'::regclass)),
  'triggers', (select coalesce(jsonb_agg(pg_get_triggerdef(oid)), '[]') from pg_trigger where not tgisinternal and tgrelid in ('public.records'::regclass,'public.push_subscriptions'::regclass,'public.push_sent'::regclass)),
  'functions', (select coalesce(jsonb_agg(pg_get_functiondef(p.oid)), '[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('validate_leve_record','validate_leve_push')),
  'cron', (select coalesce(jsonb_agg(to_jsonb(j)), '[]') from cron.job j where jobname='leve-reminders')
) as snapshot;
'@
$database = Read-Api '/database/query' @{ query = $query }
$auth = Read-Api '/config/auth'
$function = Read-Api '/functions/send-reminders'
try {
  $bodyResponse = Invoke-WebRequest -UseBasicParsing -Uri ($base + '/functions/send-reminders/body') -Headers $headers -TimeoutSec 60
  $functionBody = [Convert]::ToBase64String($bodyResponse.RawContentStream.ToArray())
} catch { throw 'Não foi possível copiar a função publicada; backup interrompido.' }
$snapshot = @{ version = 1; captured_at = [DateTime]::UtcNow.ToString('o'); project = $projectRef; database = $database; auth = $auth; function = $function; function_body_base64 = $functionBody }
$plaintext = [Text.Encoding]::UTF8.GetBytes(($snapshot | ConvertTo-Json -Depth 100 -Compress))
$cipher = [Security.Cryptography.ProtectedData]::Protect($plaintext, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$backupDir = Join-Path $root '.security-backups.local'
[IO.Directory]::CreateDirectory($backupDir) | Out-Null
$path = Join-Path $backupDir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-pre-security.dpapi')
[IO.File]::WriteAllBytes($path, $cipher)
$restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$sha = [Security.Cryptography.SHA256]::Create()
if ([Convert]::ToBase64String($sha.ComputeHash($plaintext)) -ne [Convert]::ToBase64String($sha.ComputeHash($restored))) { throw 'Verificação de integridade do backup falhou.' }
$sha.Dispose()
Write-Output "Backup criptografado e leitura verificada: $path"
Write-Output 'Escopo: três tabelas do Leve, metadados de schema, Auth, cron e função push; não é um dump integral de auth.users/Storage.'
Write-Output 'DPAPI: descriptografia exige o mesmo usuário Windows nesta máquina. Não apague o perfil nem o arquivo.'
