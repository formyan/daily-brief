$ErrorActionPreference = 'Stop'
$taskName = 'DailyBrief-Refresh'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed scheduled task '$taskName' (if it existed)."
