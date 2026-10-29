# Register a Windows task that refreshes the edition at 18:30 local time.
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-task.ps1
$ErrorActionPreference = 'Stop'

$taskName = 'DailyBrief-Refresh'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw 'Node.js was not found on PATH. Install Node.js 20+ first.'
}

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument 'scripts\refresh.mjs' `
  -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -Daily -At '18:30'
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Refresh the local Daily Brief edition at 18:30 (Asia/Shanghai).' `
  -Force | Out-Null

Write-Host "Registered scheduled task '$taskName' at 18:30."
Write-Host "Project: $root"
Write-Host "Node:    $node"
Write-Host ''
Write-Host 'The website itself still needs to be running (start.bat or start-hidden.vbs).'
Write-Host 'Remove with: powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-task.ps1'
