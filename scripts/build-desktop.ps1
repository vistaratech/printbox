# ──────────────────────────────────────────────────────────
# PrintBox Pro – Desktop Build Script
# Builds the standalone .exe setup package
# ──────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $ProjectRoot "release\PrintBox-Setup"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "       PrintBox Pro - Desktop Build Script            " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Compile TypeScript
Write-Host "[1/5] Compiling TypeScript..." -ForegroundColor Yellow
Push-Location $ProjectRoot
npx tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  TypeScript compiled to dist/" -ForegroundColor Green

# Step 2: Bundle with webpack
Write-Host "[2/5] Bundling with webpack..." -ForegroundColor Yellow
Push-Location $ProjectRoot
npx webpack --config webpack.desktop.config.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Webpack bundling failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  agent.js bundled" -ForegroundColor Green

# Step 3: Copy dashboard HTML
Write-Host "[3/5] Copying dashboard files..." -ForegroundColor Yellow
Copy-Item (Join-Path $ProjectRoot "src\desktop\dashboard.html") (Join-Path $ReleaseDir "dashboard.html") -Force
Write-Host "  dashboard.html copied" -ForegroundColor Green

# Step 4: Ensure node.exe exists
Write-Host "[4/5] Checking node.exe..." -ForegroundColor Yellow
$nodeExe = Join-Path $ReleaseDir "node.exe"
if (Test-Path $nodeExe) {
    $nodeSizeMB = [math]::Round((Get-Item $nodeExe).Length / 1MB, 1)
    Write-Host "  node.exe already present (${nodeSizeMB}MB)" -ForegroundColor Green
} else {
    Write-Host "  node.exe not found! Copying current Node.js..." -ForegroundColor Yellow
    $currentNode = (Get-Command node).Source
    Copy-Item $currentNode $nodeExe -Force
    Write-Host "  node.exe copied from $currentNode" -ForegroundColor Green
}

# Step 5: Ensure SumatraPDF exists
Write-Host "[5/5] Checking SumatraPDF..." -ForegroundColor Yellow
$sumatraExe = Join-Path $ReleaseDir "SumatraPDF-3.4.6-32.exe"
if (Test-Path $sumatraExe) {
    Write-Host "  SumatraPDF already present" -ForegroundColor Green
} else {
    $nmSumatra = Join-Path $ProjectRoot "node_modules\pdf-to-printer\dist\SumatraPDF-3.4.6-32.exe"
    if (Test-Path $nmSumatra) {
        Copy-Item $nmSumatra $sumatraExe -Force
        Write-Host "  SumatraPDF copied from node_modules" -ForegroundColor Green
    } else {
        Write-Host "  SumatraPDF not found! PDF printing may not work." -ForegroundColor Yellow
    }
}

# Summary
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " BUILD COMPLETE!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Output folder: $ReleaseDir" -ForegroundColor White
Write-Host ""

# List files
Write-Host " Package contents:" -ForegroundColor White
$items = Get-ChildItem $ReleaseDir
foreach ($item in $items) {
    $sizeStr = if ($item.PSIsContainer) { "DIR" } else { ([string][math]::Round($item.Length / 1KB)) + "KB" }
    Write-Host ("   " + $item.Name + " (" + $sizeStr + ")") -ForegroundColor Gray
}

Write-Host ""
Write-Host " To run: Double-click PrintBox.exe in the release folder" -ForegroundColor Yellow
Write-Host " To create installer: Run scripts\create-installer.ps1" -ForegroundColor Yellow
Write-Host ""
