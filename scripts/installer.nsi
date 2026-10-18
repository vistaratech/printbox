; ──────────────────────────────────────────────────────────
; PrintBox Pro – NSIS Installer Script
; Creates a professional Windows installer (.exe)
; ──────────────────────────────────────────────────────────

!include "MUI2.nsh"

; ─── General ───
Name "PrintBox Pro"
OutFile "..\PrintBox-Setup.exe"
InstallDir "$PROGRAMFILES\PrintBox Pro"
InstallDirRegKey HKLM "Software\PrintBox Pro" "InstallDir"
RequestExecutionLevel admin

; ─── UI Settings ───
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"

!define MUI_WELCOMEPAGE_TITLE "Welcome to PrintBox Pro Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install PrintBox Pro – Smart Printing Terminal on your computer.$\r$\n$\r$\nPrintBox Pro automatically receives print jobs from students and prints them on your connected printer.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_RUN "$INSTDIR\PrintBox.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch PrintBox Pro"
!define MUI_FINISHPAGE_TITLE "Installation Complete!"
!define MUI_FINISHPAGE_TEXT "PrintBox Pro has been installed successfully.$\r$\n$\r$\nMake sure your printer is connected before launching."

; ─── Pages ───
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ─── Language ───
!insertmacro MUI_LANGUAGE "English"

; ─── Version Info ───
VIProductVersion "2.0.0.0"
VIAddVersionKey "ProductName" "PrintBox Pro"
VIAddVersionKey "CompanyName" "Vistara Tech"
VIAddVersionKey "FileDescription" "PrintBox Pro – Smart Printing Terminal"
VIAddVersionKey "FileVersion" "2.0.0"
VIAddVersionKey "ProductVersion" "2.0.0"
VIAddVersionKey "LegalCopyright" "© 2026 Vistara Tech"

; ─── Install Section ───
Section "Install"
  SetOutPath "$INSTDIR"
  
  ; Copy all files
  File "PrintBox.exe"
  File "node.exe"
  File "agent.js"
  File "dashboard.html"
  File "SumatraPDF-3.4.6-32.exe"
  
  ; Create temp_prints directory
  CreateDirectory "$INSTDIR\temp_prints"
  
  ; Create default config
  IfFileExists "$INSTDIR\config.json" skip_config
    FileOpen $0 "$INSTDIR\config.json" w
    FileWrite $0 '{"machineId":"M-01","apiUrl":"https://printbox-p5i8.onrender.com/api","printerName":"","autoPrint":true,"soundEnabled":true,"paperRemaining":450,"tonerLevel":92,"pollIntervalMs":2000,"heartbeatIntervalMs":30000,"machineLocation":"Library Block"}'
    FileClose $0
  skip_config:
  
  ; Write registry keys
  WriteRegStr HKLM "Software\PrintBox Pro" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "DisplayName" "PrintBox Pro"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "DisplayVersion" "2.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "Publisher" "Vistara Tech"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro" "NoRepair" 1
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\PrintBox Pro"
  CreateShortcut "$SMPROGRAMS\PrintBox Pro\PrintBox Pro.lnk" "$INSTDIR\PrintBox.exe" "" "$INSTDIR\PrintBox.exe" 0
  CreateShortcut "$SMPROGRAMS\PrintBox Pro\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  
  ; Create Desktop shortcut
  CreateShortcut "$DESKTOP\PrintBox Pro.lnk" "$INSTDIR\PrintBox.exe" "" "$INSTDIR\PrintBox.exe" 0

SectionEnd

; ─── Uninstall Section ───
Section "Uninstall"
  ; Remove files
  Delete "$INSTDIR\PrintBox.exe"
  Delete "$INSTDIR\node.exe"
  Delete "$INSTDIR\agent.js"
  Delete "$INSTDIR\dashboard.html"
  Delete "$INSTDIR\SumatraPDF-3.4.6-32.exe"
  Delete "$INSTDIR\config.json"
  Delete "$INSTDIR\printbox.log"
  Delete "$INSTDIR\Uninstall.exe"
  
  ; Remove temp directory
  RMDir /r "$INSTDIR\temp_prints"
  
  ; Remove install directory (if empty)
  RMDir "$INSTDIR"
  
  ; Remove shortcuts
  Delete "$DESKTOP\PrintBox Pro.lnk"
  Delete "$SMPROGRAMS\PrintBox Pro\PrintBox Pro.lnk"
  Delete "$SMPROGRAMS\PrintBox Pro\Uninstall.lnk"
  RMDir "$SMPROGRAMS\PrintBox Pro"
  
  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrintBox Pro"
  DeleteRegKey HKLM "Software\PrintBox Pro"
  
SectionEnd
