param(
  [string]$WorkerPath = 'C:\ProgramData\Avantiqo\local-worker.ps1'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $WorkerPath)) { throw 'AVANTIQO_LOCAL_WORKER_SCRIPT_REQUIRED' }
$cpuTask = '\AvantiqoLocalWorker'
$gpuTask = '\AvantiqoGpuWorker'
$codeTask = '\AvantiqoCodeWorker'
$liveTask = '\AvantiqoLiveWorker'
$trainingTask = '\AvantiqoTrainingWorker'
$cpuCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane cpu"
$gpuCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane gpu"
$codeCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane code"
$liveCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane live"
$trainingCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerPath -Lane training"
& schtasks.exe /Create /TN $cpuTask /TR $cpuCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Create /TN $gpuTask /TR $gpuCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Create /TN $codeTask /TR $codeCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Create /TN $liveTask /TR $liveCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Create /TN $trainingTask /TR $trainingCommand /SC ONSTART /RU SYSTEM /F | Out-Null
& schtasks.exe /Run /TN $cpuTask | Out-Null
& schtasks.exe /Run /TN $gpuTask | Out-Null
& schtasks.exe /Run /TN $codeTask | Out-Null
& schtasks.exe /Run /TN $liveTask | Out-Null
& schtasks.exe /Run /TN $trainingTask | Out-Null
Write-Output 'AVANTIQO_NODE01_WORKERS_INSTALLED'
