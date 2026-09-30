$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { Write-Host '.env already exists; no settings were changed.'; exit 0 }
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$secretBytes = New-Object byte[] 48
$passwordBytes = New-Object byte[] 24
$random.GetBytes($secretBytes)
$random.GetBytes($passwordBytes)
$secret = [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
$databasePassword = [BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
$lines = @("POSTGRES_PASSWORD=$databasePassword", "JWT_SECRET=$secret", 'FRONTEND_URL=http://localhost:8080', 'COOKIE_SECURE=false')
[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
$random.Dispose()
Write-Host 'Created local .env. Start with: docker compose up --build'
