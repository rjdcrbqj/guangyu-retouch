param([Parameter(Mandatory=$true)][string]$InstallRoot,
      [Parameter(Mandatory=$true)][string]$StageRoot,
      [Parameter(Mandatory=$true)][string]$ManifestPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)

$installPath=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$stagePath=[IO.Path]::GetFullPath($StageRoot).TrimEnd('\')
$parent=Split-Path -Parent $installPath
$name=Split-Path -Leaf $installPath
if(-not $parent -or $parent -ne (Split-Path -Parent $stagePath) -or
   -not (Split-Path -Leaf $stagePath).StartsWith($name+'.guangyu-stage-', [StringComparison]::OrdinalIgnoreCase)){
    throw 'Incremental staging must be in the installation sibling directory'
}

function Get-PlainItem([string]$Path){
    $item=Get-Item -LiteralPath $Path -Force
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){
        throw 'Linked paths are unsupported for incremental preparation'
    }
    return $item
}

if(-not (Get-PlainItem $installPath).PSIsContainer -or -not (Get-PlainItem $stagePath).PSIsContainer){
    throw 'The installation and staging paths must be directories'
}
$manifestItem=Get-PlainItem $ManifestPath
if($manifestItem.PSIsContainer -or $manifestItem.Length -gt 4MB){throw 'Invalid incremental inventory size'}
$manifest=Get-Content -LiteralPath $manifestItem.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$versionPattern='\A(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\z'
if($manifest.format -isnot [int] -or $manifest.format -ne 1 -or
   $manifest.baseVersion -isnot [string] -or $manifest.baseVersion -cnotmatch $versionPattern -or
   $manifest.targetVersion -isnot [string] -or $manifest.targetVersion -cnotmatch $versionPattern -or
   [version]$manifest.targetVersion -le [version]$manifest.baseVersion -or
   $manifest.files -isnot [array] -or $manifest.files.Count -lt 2 -or $manifest.files.Count -gt 20000){
    throw 'Invalid incremental inventory'
}

function Get-ListedFile([string]$Root,[string]$RelativePath){
    $path=$Root
    foreach($segment in $RelativePath.Split('/')){
        $path=Join-Path $path $segment
        $item=Get-PlainItem $path
    }
    if($item.PSIsContainer){throw 'An inventory entry is not a file'}
    return $item
}

function Get-Sha256([string]$File){
    $stream=[IO.File]::OpenRead($File)
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
    finally{$algorithm.Dispose();$stream.Dispose()}
}

function Assert-File([string]$Root,$Entry){
    $file=Get-ListedFile $Root $Entry.path
    if($file.Length -ne $Entry.size -or (Get-Sha256 $file.FullName) -ine $Entry.sha256){
        throw ('Incremental file does not match its inventory: '+$Entry.path)
    }
}

$inventory=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($entry in $manifest.files){
    if($entry.path -isnot [string] -or $entry.path.Length -gt 512 -or $entry.source -cnotin @('base','changed') -or
       $entry.sha256 -isnot [string] -or $entry.sha256 -cnotmatch '\A[0-9a-f]{64}\z' -or
       ($entry.size -isnot [int] -and $entry.size -isnot [long]) -or $entry.size -lt 0 -or $entry.size -ge 2GB){
        throw 'Invalid incremental inventory entry'
    }
    foreach($segment in $entry.path.Split('/')){
        if(-not $segment -or $segment.Length -gt 255 -or $segment -match '[<>:"\\|?*\x00-\x1f]|[. ]$' -or
           $segment -imatch '\A(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9\u00b9\u00b2\u00b3])(?:\.|\z)'){
            throw 'Invalid relative path in incremental inventory'
        }
    }
    $inventory.Add($entry.path,$entry)
}

$packagePath='resources/app/package.json'
$markerPath='.guangyu-trial'
if(-not $inventory.ContainsKey($packagePath) -or -not $inventory.ContainsKey($markerPath) -or
   $inventory[$packagePath].path -cne $packagePath -or $inventory[$markerPath].path -cne $markerPath -or
   $inventory[$packagePath].source -cne 'changed'){throw 'The incremental inventory does not describe this application'}

$installedMarker=Get-ListedFile $installPath $markerPath
$installedPackage=Get-ListedFile $installPath $packagePath
$prior=Get-Content -LiteralPath $installedPackage.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
if((Get-Content -LiteralPath $installedMarker.FullName -Raw -Encoding UTF8).Trim() -cne 'guangyu-retouch-trial' -or
   $prior.name -cne 'guangyu-retouch' -or $prior.version -cne $manifest.baseVersion){
    throw 'The installed version cannot use this incremental update'
}

# 暂存内容必须恰好来自清单，逐层检查以避免通过链接读取或写入其他位置。
$pending=[Collections.Generic.Stack[string]]::new()
$pending.Push($stagePath)
while($pending.Count){
    $folder=$pending.Pop()
    foreach($child in Get-ChildItem -LiteralPath $folder -Force){
        if($child.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked staging paths are unsupported'}
        if($child.PSIsContainer){$pending.Push($child.FullName);continue}
        $relative=$child.FullName.Substring($stagePath.Length+1).Replace('\','/')
        if(-not $inventory.ContainsKey($relative) -or $inventory[$relative].path -cne $relative -or
           $inventory[$relative].source -cne 'changed'){throw 'Unlisted incremental staging file'}
    }
}

# 先核实替换件和基线，再复制到独立树。安装事务只接受校验完成的暂存内容。
foreach($entry in $manifest.files){
    if($entry.source -ceq 'base'){Assert-File $installPath $entry}
    else{Assert-File $stagePath $entry}
}
foreach($entry in $manifest.files){
    if($entry.source -cne 'base'){continue}
    $source=Get-ListedFile $installPath $entry.path
    $destination=Join-Path $stagePath $entry.path
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    [IO.File]::Copy($source.FullName,$destination,$false)
    Assert-File $stagePath $entry
}
$rebuilt=Get-ListedFile $stagePath $packagePath
$package=Get-Content -LiteralPath $rebuilt.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
if($package.name -cne 'guangyu-retouch' -or $package.version -cne $manifest.targetVersion){
    throw 'The staged application version is invalid'
}
@{baseVersion=$manifest.baseVersion;targetVersion=$manifest.targetVersion;files=$inventory.Count} | ConvertTo-Json -Compress
