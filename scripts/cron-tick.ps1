# Lizhi Routine — minute cron driver.
#
# Run by a Windows Scheduled Task every 60s. POSTs to the local Next
# server's /api/cron/tick with the CRON_SECRET read from .env.local, so
# the secret never lives in the task definition. Writes a one-line
# heartbeat to tmp/cron-last.txt so you can confirm the ticker is alive
# (and see the last result) without digging through logs.
#
# Always exits 0 — a server-down minute is expected (dev restart) and
# shouldn't surface as a "failed task" in Task Scheduler. The heartbeat
# records the error instead.

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
$tmpDir = Join-Path $root "tmp"
$logFile = Join-Path $tmpDir "cron-last.txt"
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir | Out-Null }

function Write-Beat($msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Set-Content -Path $logFile -Value "$ts  $msg" -Encoding utf8
}

try {
  $secret = $null
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*CRON_SECRET\s*=\s*(.+)$") {
      $secret = $matches[1].Trim().Trim('"')
      break
    }
  }
  if (-not $secret) { Write-Beat "ERROR: CRON_SECRET not found in .env.local"; exit 0 }

  $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/cron/tick" `
    -Method POST -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 20
  Write-Beat ("OK scanned=$($resp.scanned) pushes=$($resp.pushes) errors=$($resp.errors.Count)")
} catch {
  Write-Beat ("ERROR: " + $_.Exception.Message)
}
exit 0
