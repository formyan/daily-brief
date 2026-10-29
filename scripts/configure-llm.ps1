# Configure the DeepSeek (or other OpenAI-compatible) summary API.
# The key is written only to the local .env file; it is not echoed back.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$baseUrl = Read-Host 'Base URL [https://api.deepseek.com/v1]'
if ([string]::IsNullOrWhiteSpace($baseUrl)) { $baseUrl = 'https://api.deepseek.com/v1' }

$model = Read-Host 'Model [deepseek-chat]'
if ([string]::IsNullOrWhiteSpace($model)) { $model = 'deepseek-chat' }

$secure = Read-Host 'API Key (input hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ([string]::IsNullOrWhiteSpace($key)) {
  throw 'API key is empty.'
}

$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) {
  Copy-Item (Join-Path $root '.env.example') $envPath
}
$lines = Get-Content $envPath
$updates = @{
  'LLM_PROVIDER' = 'openai'
  'LLM_BASE_URL' = $baseUrl
  'LLM_MODEL' = $model
  'LLM_API_KEY' = $key
}
$seen = @{}
$out = foreach ($line in $lines) {
  $matched = $false
  foreach ($name in $updates.Keys) {
    if ($line -match "^\s*$([regex]::Escape($name))\s*=") {
      "$name=$($updates[$name])"
      $seen[$name] = $true
      $matched = $true
      break
    }
  }
  if (-not $matched) { $line }
}
foreach ($name in $updates.Keys) {
  if (-not $seen.ContainsKey($name)) { $out += "$name=$($updates[$name])" }
}
[System.IO.File]::WriteAllText(
  $envPath,
  (($out -join "`r`n") + "`r`n"),
  [System.Text.UTF8Encoding]::new($false)
)

$key = $null
$secure = $null
Write-Host ''
Write-Host 'Saved to .env.'
Write-Host 'Run now (no refetch needed):'
Write-Host '  node scripts\summarize.mjs'
Write-Host 'Restart the server afterwards so the 18:30 scheduler also uses the new config.'
