param([Parameter(Mandatory=$true)][string]$InstallRoot,
      [Parameter(Mandatory=$true)][string]$StageRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)

# 仅在显式安装目录及其同级事务目录移动文件，所有旧程序内容保留在目录外。
$installPath=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$stagePath=[IO.Path]::GetFullPath($StageRoot).TrimEnd('\')
$parentPath=Split-Path -Parent $installPath
$installName=Split-Path -Leaf $installPath
if(-not $parentPath -or $installPath -eq [IO.Path]::GetPathRoot($installPath).TrimEnd('\')){throw 'Invalid installation directory'}
if((Split-Path -Parent $stagePath) -ne $parentPath -or -not (Split-Path -Leaf $stagePath).StartsWith($installName+'.guangyu-stage-')){throw 'Staging must be in the installation sibling directory'}
foreach($path in @($installPath,$stagePath)){
 if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked installation directories are not supported'}
}

function Publish-Journal($temporary,$destination){
 # 同卷原子替换，文件被占用或写入中断时旧日志仍然存在。
 if(Test-Path -LiteralPath $destination){[IO.File]::Replace($temporary,$destination,($destination+'.previous'))}
 else{[IO.File]::Move($temporary,$destination)}
}
function Write-Journal($folder,$journal){
 $temporary=Join-Path $folder 'transaction.tmp'
 [IO.File]::WriteAllText($temporary,($journal|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
 Publish-Journal $temporary (Join-Path $folder 'transaction.json')
}

# 依据实际文件恢复：即使进程在一次 Rename 后、日志更新前中断，也能重建旧资源树。
function Undo-Transaction($folder,$journal){
 if($journal.InstallRoot -ne $installPath){throw 'Transaction installation mismatch'}
 foreach($entry in @($journal.Entries)){
  if($entry.Name -ne [IO.Path]::GetFileName($entry.Name) -or $entry.Name -in @('.','..')){throw 'Invalid transaction entry'}
  $target=Join-Path $installPath $entry.Name
  $old=Join-Path (Join-Path $folder 'old') $entry.Name
  $failed=Join-Path (Join-Path $folder 'failed-new') $entry.Name
  if((Test-Path -LiteralPath $old) -or (-not $entry.OldPresent -and $entry.NewIntent)){
   if(Test-Path -LiteralPath $target){
    New-Item -ItemType Directory -Path (Split-Path -Parent $failed) -Force|Out-Null
    Move-Item -LiteralPath $target -Destination $failed
   }
   if(Test-Path -LiteralPath $old){Move-Item -LiteralPath $old -Destination $target}
  }
 }
 $journal.Status='rolled-back'
 Write-Journal $folder $journal
}

New-Item -ItemType Directory -Path $installPath -Force|Out-Null
foreach($folder in Get-ChildItem -LiteralPath $parentPath -Directory -Filter ($installName+'.guangyu-backup-*')){
 $journal=$null
 foreach($name in @('transaction.json','transaction.json.previous','transaction.tmp')){
  $record=Join-Path $folder.FullName $name
  if(Test-Path -LiteralPath $record){
   try{$candidate=Get-Content -LiteralPath $record -Raw -Encoding UTF8|ConvertFrom-Json;if($candidate.InstallRoot -eq $installPath -and $candidate.Status -in @('pending','complete','rolled-back')){$journal=$candidate;break}}catch{}
  }
 }
 if($journal -and $journal.Status -eq 'pending'){Undo-Transaction $folder.FullName $journal}
 elseif(-not $journal -and (Get-ChildItem -LiteralPath (Join-Path $folder.FullName 'old') -ErrorAction SilentlyContinue)){throw 'Recovery journal is unavailable; previous files are retained in backup'}
}
if(-not (Test-Path -LiteralPath (Join-Path $stagePath 'resources/app/package.json'))){throw 'Incomplete staged application'}
$package=Get-Content -LiteralPath (Join-Path $stagePath 'resources/app/package.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($package.name -ne 'guangyu-retouch'){throw 'Unrecognized staged application'}
$oldApp=Join-Path $installPath 'resources/app'
if(Test-Path -LiteralPath $oldApp){
 $marker=Join-Path $installPath '.guangyu-trial'
 if(-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'guangyu-retouch-trial'){throw 'Unrecognized existing installation'}
 $oldPackage=Get-Content -LiteralPath (Join-Path $oldApp 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if($oldPackage.name -ne 'guangyu-retouch'){throw 'Unrecognized existing application'}
 # 如果用户把照片或工程保存在旧程序内部，复制回相同相对路径；原件仍保留在备份中。
 $userExtensions=@('.png','.jpg','.jpeg','.webp','.tif','.tiff','.heic','.guangyu','.gypreset','.gyfeature')
 foreach($file in Get-ChildItem -LiteralPath $oldApp -File -Recurse){
  if($file.Extension.ToLowerInvariant() -notin $userExtensions -and -not $file.Name.EndsWith('.guangyu.json')){continue}
  $relative=$file.FullName.Substring($oldApp.Length).TrimStart('\')
  # 程序目录内的纹理不是用户照片；它们随旧程序备份，不混回新版运行目录。
  if($relative.Split('\')[0] -in @('src','inference','node_modules')){continue}
  $target=Join-Path (Join-Path $stagePath 'resources/app') $relative
  if(Test-Path -LiteralPath $target){throw ('User data conflicts with staged application: '+$relative)}
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force|Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target
 }
}
$backup=Join-Path $parentPath ($installName+'.guangyu-backup-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $backup 'old') -Force|Out-Null
$journal=[pscustomobject]@{InstallRoot=$installPath;StageRoot=$stagePath;Status='pending';Entries=@()}
Write-Journal $backup $journal
try{
 foreach($file in Get-ChildItem -LiteralPath $stagePath -Force|Sort-Object Name){
  if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked staged files are not supported'}
  $target=Join-Path $installPath $file.Name
  $entry=[pscustomobject]@{Name=$file.Name;OldPresent=(Test-Path -LiteralPath $target);NewIntent=$false}
  $journal.Entries+=@($entry);Write-Journal $backup $journal
  if($entry.OldPresent){Move-Item -LiteralPath $target -Destination (Join-Path (Join-Path $backup 'old') $file.Name)}
  $entry.NewIntent=$true;Write-Journal $backup $journal
  Move-Item -LiteralPath $file.FullName -Destination $target
 }
 $journal.Status='complete';Write-Journal $backup $journal
 Write-Output (@{installed=$installPath;backup=$backup;status='complete'}|ConvertTo-Json -Compress)
}catch{
 $failure=$_
 Undo-Transaction $backup $journal
 throw $failure
}
