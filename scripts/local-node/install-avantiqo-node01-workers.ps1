param(
  [string]$WorkerPath = 'C:\ProgramData\Avantiqo\local-worker.ps1'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $WorkerPath)) { throw 'AVANTIQO_LOCAL_WORKER_SCRIPT_REQUIRED' }
$cpuTask = '\AvantiqoLocalWorker'
$gpuTask = '\AvantiqoGpuWorker'
$cpuCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane cpu"
$gpuCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane gpu"
& schtasks.exe /Create /TN $cpuTask /TR $cpuCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Create /TN $gpuTask /TR $gpuCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Run /TN $cpuTask | Out-Null
& schtasks.exe /Run /TN $gpuTask | Out-Null
Write-Output 'AVANTIQO_NODE01_WORKERS_INSTALLED'
