param(
  [string]$Root = 'C:\Avantiqo\intelligence-training',
  [string]$SourceRunner = '',
  [string]$Python = 'C:\Avantiqo\Python312\python.exe'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Python)) { throw 'AVANTIQO_LOCAL_TRAINING_BASE_PYTHON_REQUIRED' }
New-Item -ItemType Directory -Force -Path $Root | Out-Null
New-Item -ItemType Directory -Force -Path 'C:\ProgramData\Avantiqo\training-artifacts' | Out-Null
New-Item -ItemType Directory -Force -Path 'C:\ProgramData\Avantiqo\training-cache' | Out-Null
$venv = Join-Path $Root '.venv'
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
  & $Python -m venv $venv
}
$vp = Join-Path $venv 'Scripts\python.exe'
& $vp -m pip install --upgrade pip setuptools wheel
# Node01 is RTX 2060 / 6 GB VRAM. QLoRA is required; full 4B FP16/BF16 training is not allowed.
& $vp -m pip install --index-url https://download.pytorch.org/whl/cu128 torch
& $vp -m pip install 'transformers>=4.55,<5' 'peft>=0.17,<1' 'accelerate>=1.10,<2' 'bitsandbytes>=0.47,<1' 'safetensors>=0.6,<1' 'sentencepiece>=0.2,<1'
if ($SourceRunner) {
  if (-not (Test-Path $SourceRunner)) { throw 'AVANTIQO_LOCAL_TRAINING_SOURCE_RUNNER_REQUIRED' }
  Copy-Item -Force $SourceRunner (Join-Path $Root 'local_train.py')
}
if (-not (Test-Path (Join-Path $Root 'local_train.py'))) { throw 'AVANTIQO_LOCAL_TRAINING_RUNNER_REQUIRED' }
$env:HF_HOME='C:\ProgramData\Avantiqo\training-cache'
& $vp -c "import torch,transformers,peft,bitsandbytes,accelerate; assert torch.cuda.is_available(); print('AVANTIQO_LOCAL_TRAINING_RUNTIME_OK', torch.cuda.get_device_name(0), torch.cuda.get_device_properties(0).total_memory)"
Write-Output 'AVANTIQO_INTELLIGENCE_TRAINING_LOCAL_INSTALLED'
