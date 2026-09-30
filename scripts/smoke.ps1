param([string]$BaseUrl = 'http://localhost:5173')
$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod "$BaseUrl/api/health"
if ($health.data.status -ne 'ok') { throw 'Health check failed' }
$catalog = Invoke-RestMethod "$BaseUrl/api/products"
if ($catalog.data.total -lt 1) { throw 'Catalogue is empty. Run seed first.' }
Write-Host "PASS: API healthy; $($catalog.data.total) products available."
