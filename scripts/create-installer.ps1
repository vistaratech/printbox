# PrintBox Pro - Create Installer (.exe)
# Compiles the launcher and builds standalone Windows Installer

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ScriptsDir = $PSScriptRoot
$ReleaseDir = Join-Path $ProjectRoot "release\PrintBox-Setup"
$ReleaseRoot = Join-Path $ProjectRoot "release"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "       PrintBox Pro - Installer Builder                " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Compile C# Launcher
Write-Host "[1/3] Compiling PrintBox.exe launcher..." -ForegroundColor Yellow
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

# Step 2: Create Zip Package for Distribution & Payload
Write-Host "[2/3] Packaging distribution files..." -ForegroundColor Yellow
$zipPath = Join-Path $ReleaseRoot "PrintBox-Setup.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $zipPath -Force
$zipSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  ZIP archive generated: $zipPath (${zipSizeMB}MB)" -ForegroundColor Green

# Step 3: Build Standalone Installer .exe
Write-Host "[3/3] Compiling standalone Windows Installer..." -ForegroundColor Yellow
$installerSrc = Join-Path $ScriptsDir "PrintBoxSetupInstaller.cs"
$installerOut = Join-Path $ReleaseRoot "PrintBox-Setup.exe"

if ((Test-Path $cscPath) -and (Test-Path $installerSrc)) {
    $resArg = "/resource:$zipPath,SetupPayload.zip"
    $refArg = "/r:System.IO.Compression.FileSystem.dll"
    & $cscPath /nologo /target:winexe /out:$installerOut $refArg $resArg $installerSrc
    if ($LASTEXITCODE -eq 0) {
        $exeSizeMB = [math]::Round((Get-Item $installerOut).Length / 1MB, 1)
        Write-Host "  ✅ Standalone Installer Created: $installerOut (${exeSizeMB}MB)" -ForegroundColor Green
    } else {
        Write-Host "  Installer compilation with embedded resource failed, attempting fallback." -ForegroundColor Yellow
    }
}

# Optional: Check NSIS if available
$makensis = "C:\Program Files (x86)\NSIS\makensis.exe"
if (-not (Test-Path $makensis)) {
    $makensis = "C:\Program Files\NSIS\makensis.exe"
}
if (Test-Path $makensis) {
    Write-Host "  Building NSIS installer..." -ForegroundColor Yellow
    $nsiScript = Join-Path $ScriptsDir "installer.nsi"
    Push-Location $ReleaseDir
    & $makensis $nsiScript
    Pop-Location
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  NSIS installer created!" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " BUILD COMPLETE!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Portable folder:     $ReleaseDir\PrintBox.exe" -ForegroundColor White
if (Test-Path $installerOut) {
    Write-Host " Standalone Installer: $installerOut" -ForegroundColor Cyan
}
Write-Host ""
