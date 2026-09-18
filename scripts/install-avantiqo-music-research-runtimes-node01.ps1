param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [switch]$Apply,
  [switch]$InstallSeedVcDependencies
)

$ErrorActionPreference = 'Stop'
$AudioSeparatorVersion = '0.47.0'
$SeedVcRepo = 'https://github.com/Plachtaa/seed-vc.git'
$SeedVcCommit = '51383efd921027683c89e5348211d93ff12ac2a8'
$MusicGpuRoot = 'C:\Avantiqo\music-gpu'
$MusicGpuPython = Join-Path $MusicGpuRoot 'Scripts\python.exe'
$VocalRoleTarget = Join-Path $MusicGpuRoot 'vocal_role_separator_runner.py'
$SeedVcRoot = 'C:\Avantiqo\seed-vc'
$SeedVcPython = Join-Path $SeedVcRoot '.venv\Scripts\python.exe'
$SeedVcRunnerTarget = Join-Path $SeedVcRoot 'avantiqo_singing_voice_runner.py'
$SeedVcCheckpoint = Join-Path $SeedVcRoot 'checkpoints\DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ema.pth'
$SeedVcConfig = Join-Path $SeedVcRoot 'configs\config_dit_mel_seed_uvit_whisper_base_f0_44k.yml'
$VocalRoleSource = Join-Path $RepoRoot 'services\avantiqo-music-local\vocal_role_separator_runner.py'
$SeedVcRunnerSource = Join-Path $RepoRoot 'services\avantiqo-music-local\singing_voice_runner.py'
$ReportPath = Join-Path $RepoRoot 'local-audit-output\music-research-runtime-install.json'

function Require-File([string]$Path,[string]$Code) { if (-not (Test-Path $Path -PathType Leaf)) { throw "$Code`:$Path" } }
function Run([string]$File,[string[]]$Args) { & $File @Args; if ($LASTEXITCODE -ne 0) { throw "COMMAND_FAILED:$File exit=$LASTEXITCODE" } }
function Probe([string]$Python,[string]$Code) { & $Python -c $Code 2>$null; return ($LASTEXITCODE -eq 0) }

Require-File $VocalRoleSource 'VOCAL_ROLE_RUNNER_SOURCE_REQUIRED'
Require-File $SeedVcRunnerSource 'SINGING_VOICE_RUNNER_SOURCE_REQUIRED'
Require-File $MusicGpuPython 'MUSIC_GPU_PYTHON_REQUIRED'

$plan = [ordered]@{
  contract = 'AVANTIQO_MUSIC_RESEARCH_RUNTIME_INSTALL_PLAN_V1'
  mode = $(if($Apply){'APPLY'}else{'PLAN_ONLY'})
  audio_separator_version = $AudioSeparatorVersion
  seed_vc_repository = $SeedVcRepo
  seed_vc_commit = $SeedVcCommit
  vocal_role_target = $VocalRoleTarget
  seed_vc_root = $SeedVcRoot
  seed_vc_python = $SeedVcPython
  seed_vc_runner_target = $SeedVcRunnerTarget
  checkpoint_required = $SeedVcCheckpoint
  config_required = $SeedVcConfig
  worker_restart_performed = $false
  provider_certification_mutation_performed = $false
  production_routing_mutation_performed = $false
  production_deployment_performed = $false
}

if (-not $Apply) {
  New-Item -ItemType Directory -Force (Split-Path $ReportPath) | Out-Null
  $plan | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $ReportPath
  $plan | ConvertTo-Json -Depth 8
  exit 0
}

Run $MusicGpuPython @('-m','pip','install',"audio-separator==$AudioSeparatorVersion")
Copy-Item -Force $VocalRoleSource $VocalRoleTarget
if (-not (Probe $MusicGpuPython 'import demucs, audio_separator')) { throw 'VOCAL_ROLE_RUNTIME_IMPORT_PROBE_FAILED' }

if (-not (Test-Path (Join-Path $SeedVcRoot '.git'))) {
  New-Item -ItemType Directory -Force (Split-Path $SeedVcRoot) | Out-Null
  Run 'git' @('clone','--no-checkout',$SeedVcRepo,$SeedVcRoot)
}
Run 'git' @('-C',$SeedVcRoot,'fetch','--depth','1','origin',$SeedVcCommit)
Run 'git' @('-C',$SeedVcRoot,'checkout','--detach',$SeedVcCommit)
$actualCommit = (& git -C $SeedVcRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $SeedVcCommit) { throw "SEED_VC_COMMIT_MISMATCH:$actualCommit" }

if (-not (Test-Path $SeedVcPython)) {
  Run 'python' @('-m','venv',(Join-Path $SeedVcRoot '.venv'))
}
if ($InstallSeedVcDependencies) {
  Require-File (Join-Path $SeedVcRoot 'requirements.txt') 'SEED_VC_REQUIREMENTS_REQUIRED'
  Run $SeedVcPython @('-m','pip','install','-r',(Join-Path $SeedVcRoot 'requirements.txt'))
}
Copy-Item -Force $SeedVcRunnerSource $SeedVcRunnerTarget
Require-File (Join-Path $SeedVcRoot 'inference.py') 'SEED_VC_INFERENCE_REQUIRED'
Require-File $SeedVcCheckpoint 'SEED_VC_SINGING_CHECKPOINT_PROVISIONING_REQUIRED'
Require-File $SeedVcConfig 'SEED_VC_SINGING_CONFIG_REQUIRED'
if (-not (Probe $SeedVcPython 'import torch, librosa, soundfile')) { throw 'SEED_VC_RUNTIME_IMPORT_PROBE_FAILED' }

$report = [ordered]@{
  contract = 'AVANTIQO_MUSIC_RESEARCH_RUNTIME_INSTALL_RESULT_V1'
  success = $true
  audio_separator_version = $AudioSeparatorVersion
  vocal_role_runtime_ready = $true
  seed_vc_commit = $actualCommit
  seed_vc_model_license = 'GPL-3.0'
  seed_vc_gpl_compliance_approval_required_for_production = $true
  seed_vc_runtime_ready = $true
  seed_vc_checkpoint_present = (Test-Path $SeedVcCheckpoint)
  seed_vc_config_present = (Test-Path $SeedVcConfig)
  capability_advertisement_requires_worker_restart = $true
  worker_restart_performed = $false
  provider_certification_mutation_performed = $false
  production_routing_mutation_performed = $false
  production_deployment_performed = $false
}
New-Item -ItemType Directory -Force (Split-Path $ReportPath) | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $ReportPath
$report | ConvertTo-Json -Depth 8
