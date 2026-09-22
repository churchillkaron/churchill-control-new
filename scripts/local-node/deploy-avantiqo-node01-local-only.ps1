param(
  [string]$WorkerSource = '.\avantiqo-node01-worker.ps1',
  [string]$TrainingRunnerSource = '.\intelligence-training-local.py',
  [string]$TrainingInstallerSource = '.\install-avantiqo-intelligence-training.ps1',
  [string]$WorkerDestination = 'C:\ProgramData\Avantiqo\local-worker.ps1'
)
$ErrorActionPreference='Stop'
foreach($path in @($WorkerSource,$TrainingRunnerSource,$TrainingInstallerSource)){ if(-not(Test-Path $path)){throw "AVANTIQO_DEPLOY_SOURCE_MISSING:$path"} }
New-Item -ItemType Directory -Force -Path 'C:\ProgramData\Avantiqo' | Out-Null
Copy-Item -Force $WorkerSource $WorkerDestination
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TrainingInstallerSource -SourceRunner $TrainingRunnerSource
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Split-Path $WorkerSource) 'install-avantiqo-node01-workers.ps1') -WorkerPath $WorkerDestination
Write-Output 'AVANTIQO_NODE01_LOCAL_ONLY_DEPLOYED'
