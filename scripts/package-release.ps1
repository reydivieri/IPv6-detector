param(
  [Parameter(Mandatory = $true)][string]$ReleaseDirectory,
  [Parameter(Mandatory = $true)][string]$ArchivePath
)
$ErrorActionPreference = 'Stop'
Compress-Archive -LiteralPath $ReleaseDirectory -DestinationPath $ArchivePath -CompressionLevel Optimal -Force
$hash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$archiveName = [System.IO.Path]::GetFileName($ArchivePath)
[System.IO.File]::WriteAllText($ArchivePath + '.sha256', $hash + '  ' + $archiveName + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('Distribution archive: ' + $ArchivePath)
