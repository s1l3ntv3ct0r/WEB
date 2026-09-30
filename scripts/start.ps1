param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$bundledNode = Join-Path $runtimeRoot 'node\bin\node.exe'
$bundledPnpm = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'
$previousPath = $env:PATH
$resultCode = 0
Push-Location -LiteralPath $projectRoot
try {
    if ((Test-Path -LiteralPath $bundledNode) -and (Test-Path -LiteralPath $bundledPnpm)) {
        $env:PATH = "$(Split-Path -Parent $bundledNode);$(Split-Path -Parent $bundledPnpm);$previousPath"
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js was not found. Install Node.js 24 or restore the bundled runtime.' }
    & $nodeCommand.Source --version
    if ($LASTEXITCODE -ne 0) { throw 'Node.js could not start.' }
    if (-not (Test-Path -LiteralPath 'frontend/node_modules/vite/bin/vite.js')) {
        throw 'Dependencies are missing. Install them with pnpm install --frozen-lockfile first.'
    }
    if ($CheckOnly) {
        Write-Host 'ShopLab runtime check passed.'
    } else {
        & $nodeCommand.Source 'scripts/local-dev.mjs'
        $resultCode = $LASTEXITCODE
    }
} finally {
    $env:PATH = $previousPath
    Pop-Location
}
exit $resultCode
