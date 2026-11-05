# Regressao do harness sem Docker, rede, credenciais ou execucao de SQL.
$ErrorActionPreference = 'Stop'
function Assert-Runner($condition, $message) {
  if (-not $condition) { throw $message }
}
function docker {
  $global:LASTEXITCODE = 0
  $command = $args -join ' '
  if ($args[0] -eq 'run') {
    Assert-Runner ($command.Contains('--network none')) 'Container perdeu isolamento de rede.'
    Assert-Runner (-not ($args -contains '-p') -and -not ($args -contains '-v')) 'Porta ou volume publicado.'
  }
  if ($args -contains 'pg_isready') {
    $runnerTestState.probes++
    # Socket temporario disponivel, TCP definitivo ainda indisponivel.
    if (-not $command.Contains('-h 127.0.0.1') -or $runnerTestState.probes -ge 3) { return }
    $global:LASTEXITCODE = 1
    return
  }
  if ($args -contains 'psql') {
    Assert-Runner ($runnerTestState.probes -ge 3) 'SQL iniciou no servidor temporario.'
    Assert-Runner ($command.Contains('-h 127.0.0.1')) 'SQL usa transporte diferente da prontidao.'
    Assert-Runner ($command.Contains('ON_ERROR_STOP=1')) 'Erros SQL deixaram de interromper o teste.'
    $runnerTestState.sqlCalls++
    if ($runnerTestState.failSql) { $global:LASTEXITCODE = 2 }
  }
  if ($args[0] -eq 'stop') { $runnerTestState.stopped = $true }
}
$runnerTestState = @{ probes = 0; sqlCalls = 0; stopped = $false; failSql = $false }
foreach ($failure in @($false, $true)) {
  $runnerTestState.probes = 0
  $runnerTestState.sqlCalls = 0
  $runnerTestState.stopped = $false
  $runnerTestState.failSql = $failure
  $caught = $false
  try { & (Join-Path $PSScriptRoot 'test-database.ps1') | Out-Null }
  catch {
    if (-not $failure -or $_.Exception.Message -notlike 'Docker falhou: exec*') { throw }
    $caught = $true
  }
  Assert-Runner ($runnerTestState.stopped) 'Container nao foi limpo.'
  if ($failure) {
    Assert-Runner ($caught -and $runnerTestState.sqlCalls -eq 1) 'Falha SQL ignorada ou repetida.'
  } else {
    Assert-Runner ($runnerTestState.sqlCalls -eq 7) 'Nem todos os arquivos SQL foram executados.'
  }
}
Write-Output 'PASSOU: prontidao definitiva, suite completa, falha SQL sem retry e limpeza.'
