param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\dist")
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pluginRoot = (Resolve-Path (Join-Path $projectRoot "plugin")).Path
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputRoot.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Output directory must be inside the project: $projectRoot"
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$zipPath = Join-Path $outputRoot "local-auto-harmonize.zip"
$ccxPath = Join-Path $outputRoot "local-auto-harmonize.ccx"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
if (Test-Path -LiteralPath $ccxPath) { Remove-Item -LiteralPath $ccxPath -Force }

Compress-Archive -Path (Join-Path $pluginRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
Move-Item -LiteralPath $zipPath -Destination $ccxPath
Write-Output $ccxPath
