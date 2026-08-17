# Build a Komari-uploadable zip (forward slashes in entries).
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$out = Join-Path $root "line-grid-komari.zip"
$stage = Join-Path $env:TEMP ("line-grid-komari-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path (Join-Path $stage "dist\css"), (Join-Path $stage "dist\js") | Out-Null
Copy-Item -Force (Join-Path $root "komari-theme.json") (Join-Path $stage "komari-theme.json")
Copy-Item -Force (Join-Path $root "preview.svg") (Join-Path $stage "preview.svg")
Copy-Item -Force (Join-Path $root "index.html") (Join-Path $stage "dist\index.html")
Copy-Item -Force (Join-Path $root "css\app.css") (Join-Path $stage "dist\css\app.css")
Copy-Item -Force (Join-Path $root "js\*.js") (Join-Path $stage "dist\js")
if (Test-Path $out) { Remove-Item -Force $out }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, "Create")
Get-ChildItem -Recurse -File $stage | ForEach-Object {
  $rel = $_.FullName.Substring($stage.Length).TrimStart("\").Replace("\", "/")
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, "Optimal")
}
$zip.Dispose()
Remove-Item -Recurse -Force $stage
Write-Host "Wrote $out"
