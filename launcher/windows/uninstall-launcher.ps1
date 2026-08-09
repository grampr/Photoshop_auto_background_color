$schemeKey = "HKCU:\Software\Classes\localautoharmonize"
if (Test-Path -LiteralPath $schemeKey) {
    Remove-Item -LiteralPath $schemeKey -Recurse -Force
}
Write-Output "Removed localautoharmonize:// registration"
