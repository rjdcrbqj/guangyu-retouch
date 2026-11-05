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
Var StageDirectory
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
 ; 新程序先完整解压到同级暂存目录；解压失败不会修改现有应用。
 GetTempFileName $0
 Delete "$0"
 ${GetFileName} "$0" $0
 StrCpy $StageDirectory "$INSTDIR.guangyu-stage-$0"
 IfFileExists "$StageDirectory\*" 0 +3
 SetErrorLevel 1
 Abort
 SetOutPath "$StageDirectory"
 ClearErrors
 File /r "@PAYLOAD@\*.*"
 IfErrors 0 +3
 SetErrorLevel 1
 Abort
 InitPluginsDir
 SetOutPath "$PLUGINSDIR"
 File /oname=install-app.ps1 "@MIGRATOR@"
 ; 脚本按日志切换已识别的程序目录，失败时恢复旧程序；旧资源保留在安装目录外。
 nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-app.ps1" -InstallRoot "$INSTDIR" -StageRoot "$StageDirectory"'
 Pop $0
 StrCmp $0 "0" +4
 SetErrorLevel 1
 IfSilent +2
 MessageBox MB_ICONSTOP "更新未完成。原程序已保留或恢复，请关闭程序后重试。"
 StrCmp $0 "0" +2
 Abort
 SetOutPath "$INSTDIR"
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
