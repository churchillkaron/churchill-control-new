param(
  [string]$WorkerSource = '.\avantiqo-node01-worker.ps1',
  [string]$WorkerDestination = 'C:\ProgramData\Avantiqo\local-worker.ps1',
  [switch]$ApproveCodeLaneRestart
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $WorkerSource)) { throw 'AVANTIQO_CODE_WORKER_SOURCE_REQUIRED' }
if (-not $ApproveCodeLaneRestart) { throw 'AVANTIQO_CODE_LANE_RESTART_APPROVAL_REQUIRED' }

$destinationDirectory = Split-Path $WorkerDestination
New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null

$sourceHash = (Get-FileHash -Algorithm SHA256 $WorkerSource).Hash.ToLowerInvariant()
$tempDestination = "$WorkerDestination.next"
Copy-Item -Force $WorkerSource $tempDestination
$tempHash = (Get-FileHash -Algorithm SHA256 $tempDestination).Hash.ToLowerInvariant()
if ($tempHash -ne $sourceHash) { throw 'AVANTIQO_CODE_WORKER_COPY_HASH_MISMATCH' }

Move-Item -Force $tempDestination $WorkerDestination
$installedHash = (Get-FileHash -Algorithm SHA256 $WorkerDestination).Hash.ToLowerInvariant()
if ($installedHash -ne $sourceHash) { throw 'AVANTIQO_CODE_WORKER_INSTALL_HASH_MISMATCH' }

$codeTask = '\AvantiqoCodeWorker'
$codeCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerDestination -Lane code"

& schtasks.exe /End /TN $codeTask 2>$null | Out-Null
Start-Sleep -Milliseconds 500
& schtasks.exe /Create /TN $codeTask /TR $codeCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Run /TN $codeTask | Out-Null
Start-Sleep -Seconds 2

$query = (& schtasks.exe /Query /TN $codeTask /FO LIST /V 2>$null) -join [Environment]::NewLine
if ($LASTEXITCODE -ne 0) { throw 'AVANTIQO_CODE_WORKER_TASK_QUERY_FAILED' }
if ($query -notmatch 'Status:\s+Running') { throw 'AVANTIQO_CODE_WORKER_TASK_NOT_RUNNING' }

[ordered]@{
  success = $true
  contract = 'AVANTIQO_NODE01_CODE_WORKER_REFRESH_V1'
  worker_source_sha256 = $sourceHash
  worker_destination_sha256 = $installedHash
  code_lane_restarted = $true
  gpu_lane_restarted = $false
  cpu_lane_restarted = $false
  live_lane_restarted = $false
  training_lane_restarted = $false
  production_deploy_performed = $false
} | ConvertTo-Json -Depth 4
