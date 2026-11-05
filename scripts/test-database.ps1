$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'leve-security-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$pushTemp = Join-Path ([IO.Path]::GetTempPath()) ($containerName + '.sql')
$created = $false
function Invoke-Docker {
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw "Docker falhou: $($args[0]) (código $LASTEXITCODE)" }
}
try {
  # Sem porta publicada, sem volume, sem rede e com nome único.
  Invoke-Docker run --rm --detach --network none --name $containerName --label leve.security-test=true -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16 -c wal_level=logical | Out-Null
  $created = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec $containerName pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'PostgreSQL não ficou pronto em 30 segundos.' }
  # pg_cron/pg_net não existem na imagem PostgreSQL simples. Somente as duas
  # declarações de extensões são retiradas; tabelas, RLS e triggers são originais.
  $push = [IO.File]::ReadAllText((Join-Path $repoRoot 'supabase/push.sql'))
  $push = [regex]::Replace($push, '(?m)^create extension if not exists pg_(cron|net);\r?\n?', '')
  [IO.File]::WriteAllText($pushTemp, $push, (New-Object Text.UTF8Encoding $false))
  $files = @(
    (Join-Path $repoRoot 'supabase/tests/bootstrap.sql'),
    (Join-Path $repoRoot 'supabase/schema.sql'),
    $pushTemp,
    (Join-Path $repoRoot 'supabase/tests/isolation.sql'),
    (Join-Path $repoRoot 'supabase/tests/validation.sql')
  )
  foreach ($file in $files) {
    Invoke-Docker cp $file "${containerName}:/tmp/test.sql"
    Invoke-Docker exec $containerName psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/test.sql
  }
  Write-Output 'PASSOU: schema, triggers e isolamento SQL local. Auth, Realtime, cron e entrega push não foram testados por este runner.'
} finally {
  if ($created) { & docker stop $containerName | Out-Null }
  if (Test-Path -LiteralPath $pushTemp) { Remove-Item -LiteralPath $pushTemp }
}
