param([string]$Repository = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$esbuild = Join-Path $Repository 'node_modules\.bin\esbuild.cmd'
if (!(Test-Path $esbuild)) {
  throw 'Install repo dependencies first (npm install), then rerun this script.'
}
$inputPath = Join-Path $Repository 'shared\game\Board2048.ts'
$outputPath = Join-Path $Repository 'public\theme-preview\nightmarket-diorama\board2048-shared.mjs'
if (!(Test-Path $inputPath)) {throw 'Missing authoritative Board2048 source.'}
& $esbuild $inputPath --bundle --platform=browser --format=esm --target=es2020 --minify "--outfile=$outputPath"
if ($LASTEXITCODE -ne 0) {throw 'Shared Board2048 compilation failed.'}
node --check $outputPath
if ($LASTEXITCODE -ne 0) {throw 'Generated shared game module is invalid.'}
Write-Output "Night market preview game core compiled from $inputPath"
Write-Output "Derived artifact: $outputPath"
