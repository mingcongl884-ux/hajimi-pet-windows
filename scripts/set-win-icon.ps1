$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$exePath = Join-Path $root "dist\win-unpacked\XiaoMi Pet.exe"
$iconPath = Join-Path $root "assets\icons\app-icon.ico"
$cacheRoot = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
$localRcedit = Join-Path $root "node_modules\rcedit\bin\rcedit-x64.exe"

if (!(Test-Path -LiteralPath $exePath)) {
  throw "Packaged executable not found: $exePath"
}

if (!(Test-Path -LiteralPath $iconPath)) {
  throw "Icon not found: $iconPath"
}

if (Test-Path -LiteralPath $localRcedit) {
  $rceditPath = $localRcedit
} else {
  $rcedit = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter "rcedit-x64.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $rceditPath = $rcedit.FullName
}

if (!$rceditPath) {
  throw "rcedit-x64.exe not found. Run npm install before packaging."
}

& $rceditPath $exePath --set-icon $iconPath
if ($LASTEXITCODE -ne 0) {
  throw "rcedit failed with exit code $LASTEXITCODE"
}

Write-Host "Updated Windows icon: $exePath"
