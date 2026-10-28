Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
Name "光屿修图 @VERSION@"
OutFile "@OUTFILE@"
InstallDir "$LOCALAPPDATA\Programs\GuangyuRetouchTrial"
RequestExecutionLevel user
SetCompressor zlib
ShowInstDetails show
VIProductVersion "@VERSION@.0"
VIAddVersionKey /LANG=2052 "ProductName" "光屿修图"
VIAddVersionKey /LANG=2052 "FileDescription" "光屿修图安装与更新程序"
VIAddVersionKey /LANG=2052 "FileVersion" "@VERSION@.0"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Var Updating
Function .onInit
 ${IfNot} ${RunningX64}
  MessageBox MB_ICONSTOP "此版本需要64位Windows。"
  Abort
 ${EndIf}
 StrCpy $Updating 0
 ${GetParameters} $R2
 ClearErrors
 ${GetOptions} $R2 "/UPDATE" $R3
 ${IfNot} ${Errors}
  StrCpy $Updating 1
 ${EndIf}
 ClearErrors
 ${GetOptions} $R2 "/WAITPID=" $R0
 ${IfNot} ${Errors}
  StrCpy $0 $R0
  System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i r0) p.r1'
  ${If} $1 != 0
   System::Call 'kernel32::WaitForSingleObject(p r1, i 120000) i.r2'
   System::Call 'kernel32::CloseHandle(p r1)'
   ${If} $2 != 0
    SetErrorLevel 1
    Quit
   ${EndIf}
  ${EndIf}
 ${EndIf}
FunctionEnd
Section "安装"
 SetOutPath "$INSTDIR"
 File /r "@PAYLOAD@\*.*"
 WriteUninstaller "$INSTDIR\卸载光屿修图.exe"
 CreateShortcut "$DESKTOP\光屿修图试用版.lnk" "$INSTDIR\光屿修图.exe"
 CreateDirectory "$SMPROGRAMS\光屿修图试用版"
 CreateShortcut "$SMPROGRAMS\光屿修图试用版\光屿修图.lnk" "$INSTDIR\光屿修图.exe"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GuangyuRetouchTrial" "DisplayName" "光屿修图 @VERSION@"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GuangyuRetouchTrial" "DisplayVersion" "@VERSION@"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GuangyuRetouchTrial" "UninstallString" '$\"$INSTDIR\卸载光屿修图.exe$\"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GuangyuRetouchTrial" "DisplayIcon" "$INSTDIR\光屿修图.exe"
 ${If} $Updating == 1
  Exec '"$INSTDIR\光屿修图.exe"'
 ${EndIf}
SectionEnd
Section "Uninstall"
 IfFileExists "$INSTDIR\.guangyu-trial" 0 done
 Delete "$DESKTOP\光屿修图试用版.lnk"
 RMDir /r "$SMPROGRAMS\光屿修图试用版"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GuangyuRetouchTrial"
 RMDir /r "$INSTDIR"
 done:
SectionEnd
