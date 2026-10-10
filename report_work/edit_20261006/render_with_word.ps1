param(
    [Parameter(Mandatory = $true)][string]$InputDocx,
    [Parameter(Mandatory = $true)][string]$OutputPdf
)
$ErrorActionPreference = 'Stop'
$resolvedDocx = (Resolve-Path -LiteralPath $InputDocx).Path
$resolvedPdf = [System.IO.Path]::GetFullPath($OutputPdf)
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    $document = $word.Documents.Open($resolvedDocx, $false, $false, $false)
    $document.TrackRevisions = $false
    $document.Repaginate()
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    $document.Fields.Update() | Out-Null
    $document.Repaginate()
    $document.Save()
    $document.ExportAsFixedFormat($resolvedPdf, 17)
    [PSCustomObject]@{ Pdf = $resolvedPdf; Pages = $document.ComputeStatistics(2); TablesOfContents = $document.TablesOfContents.Count } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $document) {
        $document.Close(0)
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
    }
    if ($null -ne $word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
    }
}
