$ErrorActionPreference = "Stop"
$launcher = (Resolve-Path (Join-Path $PSScriptRoot "start-backend.ps1")).Path
$schemeKey = "HKCU:\Software\Classes\localautoharmonize"
$commandKey = Join-Path $schemeKey "shell\open\command"
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" `"%1`""

New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $schemeKey -Value "URL:Local Auto Harmonize Launcher"
New-ItemProperty -Path $schemeKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
Set-Item -Path $commandKey -Value $command
Write-Output "Registered localautoharmonize:// for $launcher"
