; Used only by the "full" installer (tauri.full.conf.json).
; LibreOffice is shipped as one compressed archive (bin\libreoffice.7z) because NSIS cannot hold the
; unpacked 1 GB next to the rest of the app; the installer unpacks it with the bundled 7-Zip.

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\bin\libreoffice.7z" 0 +4
    DetailPrint "Unpacking LibreOffice..."
    nsExec::ExecToLog '"$INSTDIR\bin\7zip\7z.exe" x -y "-o$INSTDIR\bin" "$INSTDIR\bin\libreoffice.7z"'
    Delete "$INSTDIR\bin\libreoffice.7z"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$INSTDIR\bin\libreoffice"
!macroend
