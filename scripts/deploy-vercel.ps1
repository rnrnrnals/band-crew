# BandCrew → Vercel production deploy
# Usage: .\scripts\deploy-vercel.ps1
# Requires: npx vercel login (once)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

$envFile = Join-Path $PWD ".env"
if (-not (Test-Path $envFile)) {
  Write-Error ".env not found. Copy .env.example to .env and fill Supabase keys."
}

$buildArgs = @()
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $pair = $_ -split '=', 2
  if ($pair.Count -lt 2) { return }
  $key = $pair[0].Trim()
  $val = $pair[1].Trim()
  if ($key -match '^VITE_') {
    $buildArgs += "-b"
    $buildArgs += "${key}=${val}"
  }
}

Write-Host "Deploying to Vercel (production)..."
& npx vercel deploy --prod --yes @buildArgs
