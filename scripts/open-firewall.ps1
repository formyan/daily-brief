# Allow the local Daily Brief port through Windows Firewall for private networks,
# so an Android phone on the same Wi-Fi can open http://<PC-IP>:4173.
# Run PowerShell as Administrator.
$ErrorActionPreference = 'Stop'
$port = 4173
$name = "Daily Brief $port"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  throw 'Please run this script from an Administrator PowerShell window.'
}

$existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule '$name' already exists."
} else {
  New-NetFirewallRule `
    -DisplayName $name `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $port `
    -Action Allow `
    -Profile Private `
    -Description 'Daily Brief local web app (LAN access for Android).' | Out-Null
  Write-Host "Created firewall rule '$name' for TCP $port on Private networks."
}

Write-Host "Phone URL: http://<this-PC-LAN-IP>:$port"
Write-Host 'Remove with: Remove-NetFirewallRule -DisplayName "Daily Brief 4173"'
