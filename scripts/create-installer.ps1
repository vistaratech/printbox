# PrintBox Pro - Create Installer (.exe)
# Compiles the launcher and builds NSIS installer

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ScriptsDir = $PSScriptRoot
$ReleaseDir = Join-Path $ProjectRoot "release\PrintBox-Setup"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "       PrintBox Pro - Installer Builder                " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Compile C# Launcher
Write-Host "[1/2] Compiling PrintBox.exe launcher..." -ForegroundColor Yellow
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
    $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $cscPath)) {
    Write-Host "  C# compiler not found. Using existing PrintBox.exe" -ForegroundColor Yellow
} else {
    $launcherSrc = Join-Path $ScriptsDir "PrintBoxLauncher.cs"
    $launcherOut = Join-Path $ReleaseDir "PrintBox.exe"
    & $cscPath /nologo /target:winexe /out:$launcherOut $launcherSrc
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Launcher compilation failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  PrintBox.exe compiled" -ForegroundColor Green
}

# Step 2: Build NSIS Installer
Write-Host "[2/2] Checking NSIS installer..." -ForegroundColor Yellow
$makensis = "C:\Program Files (x86)\NSIS\makensis.exe"
if (-not (Test-Path $makensis)) {
    $makensis = "C:\Program Files\NSIS\makensis.exe"
}

if (Test-Path $makensis) {
    $nsiScript = Join-Path $ScriptsDir "installer.nsi"
    Push-Location $ReleaseDir
    & $makensis $nsiScript
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  NSIS build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  PrintBox-Setup.exe installer created!" -ForegroundColor Green
} else {
    Write-Host "  NSIS not found. Creating ZIP package instead..." -ForegroundColor Yellow
    $zipPath = Join-Path $ProjectRoot "release\PrintBox-Setup.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $zipPath -Force
    Write-Host "  ZIP created: $zipPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " BUILD COMPLETE!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Portable folder: $ReleaseDir" -ForegroundColor White
Write-Host ""
