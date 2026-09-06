# Build a Komari-uploadable zip (forward slashes in entries).
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$out = Join-Path $root "line-grid-komari.zip"
$stage = Join-Path $env:TEMP ("line-grid-komari-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path (Join-Path $stage "dist\css"), (Join-Path $stage "dist\js"), (Join-Path $stage "dist\img") | Out-Null
Copy-Item -Force (Join-Path $root "komari-theme.json") (Join-Path $stage "komari-theme.json")
Copy-Item -Force (Join-Path $root "preview.svg") (Join-Path $stage "preview.svg")
Copy-Item -Force (Join-Path $root "index.html") (Join-Path $stage "dist\index.html")
Copy-Item -Force (Join-Path $root "css\*.css") (Join-Path $stage "dist\css")
Copy-Item -Recurse -Force (Join-Path $root "fonts") (Join-Path $stage "dist\fonts")
Copy-Item -Force (Join-Path $root "js\*.js") (Join-Path $stage "dist\js")
if (Test-Path (Join-Path $root "img")) {
  Copy-Item -Force (Join-Path $root "img\*") (Join-Path $stage "dist\img")
}
if (Test-Path $out) { Remove-Item -Force $out }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, "Create")
Get-ChildItem -Recurse -File $stage | ForEach-Object {
  $rel = $_.FullName.Substring($stage.Length).TrimStart("\").Replace("\", "/")
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, "Optimal")
}
$zip.Dispose()
$resolvedStage = (Resolve-Path -LiteralPath $stage).Path
$expectedStage = [IO.Path]::GetFullPath($stage)
$tempRoot = (Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd("\") + "\"
if ($resolvedStage -ne $expectedStage -or -not $resolvedStage.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedStage) -notmatch "^line-grid-komari-[0-9a-f]{32}$") { throw "Unsafe staging path: $resolvedStage" }
Remove-Item -LiteralPath $resolvedStage -Recurse -Force
Write-Host "Wrote $out"
