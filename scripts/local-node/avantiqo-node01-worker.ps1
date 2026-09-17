param(
  [ValidateSet('supervisor','gpu','cpu')]
  [string]$Lane = 'supervisor'
)

$ErrorActionPreference = 'Stop'
if ($Lane -eq 'supervisor') {
  $children = @{}
  while ($true) {
    foreach ($childLane in @('gpu','cpu')) {
      $job = $children[$childLane]
      if (-not $job -or $job.State -ne 'Running') {
        if ($job) { Receive-Job $job -ErrorAction SilentlyContinue | Out-Null; Remove-Job $job -Force -ErrorAction SilentlyContinue }
        $children[$childLane] = Start-Job -Name ("Avantiqo-" + $childLane) -ScriptBlock { param($ScriptPath,$WorkerLane) & $ScriptPath -Lane $WorkerLane } -ArgumentList $PSCommandPath,$childLane
      }
    }
    foreach ($job in @($children.Values)) { Receive-Job $job -ErrorAction SilentlyContinue | Out-Null }
    Start-Sleep -Seconds 5
  }
}

$BaseUrl = 'https://vfsjqabpkcbiuerhzugk.supabase.co'
$ApiKey = [Environment]::GetEnvironmentVariable('AVANTIQO_SUPABASE_PUBLISHABLE_KEY','Machine')
if (-not $ApiKey) { throw 'AVANTIQO_SUPABASE_PUBLISHABLE_KEY_REQUIRED' }
$NodeId = 'avantiqo-node-01'
$TokenPath = 'C:\ProgramData\Avantiqo\node-token.txt'
$OllamaUrl = 'http://127.0.0.1:11434'
$Model = 'qwen3:4b-instruct'
$ContextTokens = 6144
$AllCapabilities = @('ai.text.generate','ai.audio.elastic-warp','media.ffmpeg.process','ai.speech.to.text','ai.image.upscale')
$GpuCapabilities = @('ai.text.generate','ai.speech.to.text','ai.image.upscale')
$CpuCapabilities = @('ai.audio.elastic-warp','media.ffmpeg.process')
$Capabilities = $(if ($Lane -eq 'gpu') { $GpuCapabilities } elseif ($Lane -eq 'cpu') { $CpuCapabilities } else { $AllCapabilities })
if ($Lane -eq 'cpu') {
  try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch {}
} elseif ($Lane -eq 'gpu') {
  try { (Get-Process -Id $PID).PriorityClass = 'Normal' } catch {}
}

function Headers {
  return @{
    apikey = $ApiKey
    Authorization = "Bearer $ApiKey"
    'Content-Type' = 'application/json'
  }
}

function Rpc([string]$Name, [hashtable]$Body) {
  $json = $Body | ConvertTo-Json -Depth 20 -Compress
  return Invoke-RestMethod -Uri "$BaseUrl/rest/v1/rpc/$Name" -Method Post -Headers (Headers) -Body $json -TimeoutSec 30
}

function NodeToken {
  if (-not (Test-Path $TokenPath)) { throw 'AVANTIQO_NODE_TOKEN_MISSING' }
  return (Get-Content $TokenPath -Raw).Trim()
}

function Heartbeat {
  $gpu = @{}
  try {
    $line = (& nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    if ($line) {
      $v = @($line -split ',\s*')
      $gpu = @{ name=$v[0]; driver=$v[1]; vram_total_mb=[int]$v[2]; vram_used_mb=[int]$v[3]; utilization_pct=[int]$v[4]; temperature_c=[int]$v[5]; power_w=[double]$v[6] }
    }
  } catch {}
  $models = @()
  try { $tags = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -Method Get -TimeoutSec 5; $models = @($tags.models | ForEach-Object { $_.name }) } catch {}
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $meta = @{
    host=$env:COMPUTERNAME; runtime='ollama'; runtime_url='127.0.0.1:11434'; model=$Model; models=$models; worker='powershell-v3'; worker_lane=$Lane; local_context_tokens=$ContextTokens;
    gpu=$gpu; cpu=@{ name=$cpu.Name; cores=[int]$cpu.NumberOfCores; logical_processors=[int]$cpu.NumberOfLogicalProcessors };
    memory=@{ total_mb=[int]($os.TotalVisibleMemorySize/1024); free_mb=[int]($os.FreePhysicalMemory/1024) };
    disk=@{ c_total_gb=[math]::Round($drive.Size/1GB,1); c_free_gb=[math]::Round($drive.FreeSpace/1GB,1) };
    ollama_version='0.33.3'
  }
  [void](Rpc 'heartbeat_avantiqo_local_compute_node' @{
    p_node_id=$NodeId; p_node_token=(NodeToken); p_capabilities=$AllCapabilities; p_metadata=$meta
  })
}
function ClaimJobs {
  return @(Rpc 'claim_avantiqo_local_compute_jobs' @{
    p_node_id=$NodeId; p_node_token=(NodeToken); p_capabilities=$Capabilities; p_limit=1; p_lease_seconds=300
  })
}

function CompleteJob($Job, $Result, $Metrics) {
  [void](Rpc 'complete_avantiqo_local_compute_job' @{
    p_node_id=$NodeId; p_node_token=(NodeToken); p_job_id=$Job.id; p_result=$Result; p_metrics=$Metrics
  })
}

function FailJob($Job, [string]$Code, [bool]$Retryable=$true) {
  [void](Rpc 'fail_avantiqo_local_compute_job' @{
    p_node_id=$NodeId; p_node_token=(NodeToken); p_job_id=$Job.id; p_error_code=$Code; p_retryable=$Retryable
  })
}

function RunTextJob($Job) {
  $payload = $Job.payload
  $messages = @()
  if ($payload.messages) { $messages = @($payload.messages) }
  elseif ($payload.prompt) { $messages = @(@{ role='user'; content=[string]$payload.prompt }) }
  else { throw 'AVANTIQO_LOCAL_TEXT_INPUT_REQUIRED' }
  $temperature = 0.2
  if ($null -ne $payload.temperature) {
    try { $temperature = [double]$payload.temperature } catch {}
  }
  $temperature = [Math]::Max(0.0, [Math]::Min(1.5, $temperature))

  $tokenCap = $(if ([string]$Job.lane -eq 'front') { 640 } else { 4096 })
  $numPredict = 1024
  if ($null -ne $payload.max_output_tokens) {
    try { $numPredict = [int]$payload.max_output_tokens } catch {}
  }
  $numPredict = [Math]::Max(1, [Math]::Min($tokenCap, $numPredict))

  $body = @{
    model = $(if ($Job.model) { [string]$Job.model } else { $Model })
    messages = $messages
    stream = $false
    think = $false
    keep_alive = '30m'
    options = @{ temperature = $temperature; num_predict = $numPredict; num_ctx = $ContextTokens }
  }
  if ($payload.response_format -and [string]$payload.response_format.type -eq 'json_object') { $body.format = 'json' }
  $started = Get-Date
  $raw = Invoke-RestMethod -Uri "$OllamaUrl/api/chat" -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 120
  $elapsed = [int](((Get-Date) - $started).TotalMilliseconds)
  $text = [string]$raw.message.content
  $executionResource = 'LOCAL_CPU'
  $gpuVramBytes = 0
  try {
    $loaded = Invoke-RestMethod -Uri "$OllamaUrl/api/ps" -Method Get -TimeoutSec 5
    $activeModel = @($loaded.models | Where-Object { [string]$_.name -eq [string]$raw.model } | Select-Object -First 1)
    if ($activeModel -and [int64]$activeModel[0].size_vram -gt 0) {
      $executionResource = 'LOCAL_GPU'
      $gpuVramBytes = [int64]$activeModel[0].size_vram
    }
  } catch {}
  $result = @{
    status='completed'; provider='avantiqo-intelligence'; infrastructure_provider='AVANTIQO_LOCAL_NODE_V1';
    runtime_model=[string]$raw.model; execution_resource=$executionResource; gpu_vram_bytes=$gpuVramBytes;
    text=$text; finish_reason=[string]$raw.done_reason;
    usage=@{ input_tokens=[int]$raw.prompt_eval_count; output_tokens=[int]$raw.eval_count }
  }
  $metrics = @{
    elapsed_ms=$elapsed; total_duration_ns=[int64]$raw.total_duration; load_duration_ns=[int64]$raw.load_duration;
    prompt_tokens=[int]$raw.prompt_eval_count; completion_tokens=[int]$raw.eval_count;
    gpu_workload=($executionResource -eq 'LOCAL_GPU'); gpu_vram_bytes=$gpuVramBytes
  }
  CompleteJob $Job $result $metrics
}


function UnloadOllamaModel {
  try {
    $body = @{ model=$Model; keep_alive=0 } | ConvertTo-Json -Compress
    [void](Invoke-RestMethod -Uri "$OllamaUrl/api/generate" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 15)
  } catch {}
}

function RunVoiceSttJob($Job) {
  $payload = $Job.payload
  if (-not $payload) { throw 'AVANTIQO_LOCAL_VOICE_STT_PAYLOAD_REQUIRED' }
  $python = 'C:\Avantiqo\voice-stt\Scripts\python.exe'
  $runner = 'C:\Avantiqo\voice-stt\local_runner.py'
  $ffmpeg = 'C:\Avantiqo\ffmpeg\bin'
  if (-not (Test-Path $python)) { throw 'AVANTIQO_LOCAL_VOICE_STT_PYTHON_REQUIRED' }
  if (-not (Test-Path $runner)) { throw 'AVANTIQO_LOCAL_VOICE_STT_RUNNER_REQUIRED' }
  if (-not (Test-Path (Join-Path $ffmpeg 'ffmpeg.exe'))) { throw 'AVANTIQO_LOCAL_VOICE_STT_FFMPEG_REQUIRED' }
  $tmp = Join-Path $env:TEMP ("avantiqo-voice-stt-" + [string]$Job.id + ".json")
  $err = Join-Path $env:TEMP ("avantiqo-voice-stt-" + [string]$Job.id + ".err")
  try {
    UnloadOllamaModel
    $jsonPayload = $payload | ConvertTo-Json -Depth 40 -Compress
    [System.IO.File]::WriteAllText($tmp, $jsonPayload, (New-Object System.Text.UTF8Encoding($false)))
    $previousPath = $env:PATH
    $env:PATH = "$ffmpeg;$previousPath"
    $started = Get-Date
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & $python $runner --input $tmp 2> $err
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    $env:PATH = $previousPath
    $stderr = $(if (Test-Path $err) { (Get-Content $err -Raw).Trim() } else { '' })
    if ($exitCode -ne 0) { throw ('AVANTIQO_LOCAL_VOICE_STT_PROCESS_FAILED:' + $stderr) }
    $json = (($output | Out-String).Trim())
    if (-not $json) { throw 'AVANTIQO_LOCAL_VOICE_STT_OUTPUT_REQUIRED' }
    $result = $json | ConvertFrom-Json
    $elapsed = [int](((Get-Date) - $started).TotalMilliseconds)
    $result | Add-Member -NotePropertyName node_id -NotePropertyValue $NodeId -Force
    $peakBytes = 0
    try { $peakBytes = [int64]$result.gpu_peak_allocated_bytes } catch {}
    CompleteJob $Job $result @{
      elapsed_ms=$elapsed; gpu_workload=$true; gpu_peak_allocated_bytes=$peakBytes;
      voice_stt=$true; local_batch_size=1
    }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $tmp,$err
  }
}

function RunImageUpscaleJob($Job) {
  $payload = $Job.payload
  if (-not $payload) { throw 'AVANTIQO_LOCAL_IMAGE_UPSCALE_PAYLOAD_REQUIRED' }
  $python = 'C:\Avantiqo\voice-stt\Scripts\python.exe'
  $runner = 'C:\Avantiqo\image-upscale\local_runner.py'
  if (-not (Test-Path $python)) { throw 'AVANTIQO_LOCAL_IMAGE_UPSCALE_PYTHON_REQUIRED' }
  if (-not (Test-Path $runner)) { throw 'AVANTIQO_LOCAL_IMAGE_UPSCALE_RUNNER_REQUIRED' }
  $tmp = Join-Path $env:TEMP ("avantiqo-image-upscale-" + [string]$Job.id + ".json")
  $err = Join-Path $env:TEMP ("avantiqo-image-upscale-" + [string]$Job.id + ".err")
  try {
    UnloadOllamaModel
    [System.IO.File]::WriteAllText($tmp, ($payload | ConvertTo-Json -Depth 40 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    $started = Get-Date
    $previousErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $output = & $python $runner --input $tmp 2> $err
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    $stderr = $(if (Test-Path $err) { (Get-Content $err -Raw).Trim() } else { '' })
    if ($exitCode -ne 0) { [IO.File]::WriteAllText('C:\ProgramData\Avantiqo\last-image-upscale-error.txt',$stderr); $tail = $(if ($stderr.Length -gt 900) { $stderr.Substring($stderr.Length - 900) } else { $stderr }); throw ('AVANTIQO_LOCAL_IMAGE_UPSCALE_PROCESS_FAILED:' + $tail) }
    $json = (($output | Out-String).Trim()); if (-not $json) { throw 'AVANTIQO_LOCAL_IMAGE_UPSCALE_OUTPUT_REQUIRED' }
    $result = $json | ConvertFrom-Json; $elapsed = [int](((Get-Date) - $started).TotalMilliseconds)
    $result | Add-Member -NotePropertyName node_id -NotePropertyValue $NodeId -Force
    $peakBytes = 0; try { $peakBytes = [int64]$result.gpu_peak_allocated_bytes } catch {}
    CompleteJob $Job $result @{ elapsed_ms=$elapsed; gpu_workload=$true; image_upscale=$true; gpu_peak_allocated_bytes=$peakBytes }
  } finally { Remove-Item -Force -ErrorAction SilentlyContinue $tmp,$err }
}

function RunElasticJob($Job) {
  $payload = $Job.payload
  if (-not $payload) { throw 'AVANTIQO_LOCAL_ELASTIC_PAYLOAD_REQUIRED' }
  $python = 'C:\Avantiqo\Python312\python.exe'
  $runner = 'C:\Avantiqo\elastic\local_runner.py'
  $ffmpeg = 'C:\Avantiqo\ffmpeg\bin'
  if (-not (Test-Path $python)) { throw 'AVANTIQO_LOCAL_ELASTIC_PYTHON_REQUIRED' }
  if (-not (Test-Path $runner)) { throw 'AVANTIQO_LOCAL_ELASTIC_RUNNER_REQUIRED' }
  if (-not (Test-Path (Join-Path $ffmpeg 'ffmpeg.exe'))) { throw 'AVANTIQO_LOCAL_ELASTIC_FFMPEG_REQUIRED' }
  $tmp = Join-Path $env:TEMP ("avantiqo-elastic-" + [string]$Job.id + ".json")
  try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 40 -Compress
    [System.IO.File]::WriteAllText($tmp, $jsonPayload, (New-Object System.Text.UTF8Encoding($false)))
    $previousPath = $env:PATH
    $env:PATH = "$ffmpeg;$previousPath"
    $started = Get-Date
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & $python $runner --input $tmp 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    $env:PATH = $previousPath
    if ($exitCode -ne 0) { $detail=(($output | Out-String).Trim()); [IO.File]::WriteAllText('C:\ProgramData\Avantiqo\last-elastic-error.txt',$detail); throw ('AVANTIQO_LOCAL_ELASTIC_PROCESS_FAILED:' + $detail) }
    $json = (($output | Out-String).Trim())
    if (-not $json) { throw 'AVANTIQO_LOCAL_ELASTIC_OUTPUT_REQUIRED' }
    $result = $json | ConvertFrom-Json
    $elapsed = [int](((Get-Date) - $started).TotalMilliseconds)
    $result | Add-Member -NotePropertyName infrastructure_provider -NotePropertyValue 'AVANTIQO_LOCAL_NODE_V1' -Force
    $result | Add-Member -NotePropertyName node_id -NotePropertyValue $NodeId -Force
    $result | Add-Member -NotePropertyName runtime_model -NotePropertyValue 'signalsmith-stretch' -Force
    $result | Add-Member -NotePropertyName raw_reasoning_persisted -NotePropertyValue $false -Force
    CompleteJob $Job $result @{ elapsed_ms=$elapsed; cpu_workload=$true }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $tmp
  }
}


function RunMediaJob($Job) {
  $payload = $Job.payload
  if (-not $payload) { throw 'AVANTIQO_LOCAL_MEDIA_PAYLOAD_REQUIRED' }
  $python = 'C:\Avantiqo\Python312\python.exe'
  $runner = 'C:\Avantiqo\media\local_media_runner.py'
  $ffmpeg = 'C:\Avantiqo\ffmpeg\bin'
  if (-not (Test-Path $python)) { throw 'AVANTIQO_LOCAL_MEDIA_PYTHON_REQUIRED' }
  if (-not (Test-Path $runner)) { throw 'AVANTIQO_LOCAL_MEDIA_RUNNER_REQUIRED' }
  if (-not (Test-Path (Join-Path $ffmpeg 'ffmpeg.exe'))) { throw 'AVANTIQO_LOCAL_MEDIA_FFMPEG_REQUIRED' }
  $tmp = Join-Path $env:TEMP ("avantiqo-media-" + [string]$Job.id + ".json")
  try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 40 -Compress
    [System.IO.File]::WriteAllText($tmp, $jsonPayload, (New-Object System.Text.UTF8Encoding($false)))
    $previousPath = $env:PATH; $env:PATH = "$ffmpeg;$previousPath"
    $previousErrorActionPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $started = Get-Date
    $output = & $python $runner --input $tmp 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference; $env:PATH = $previousPath
    if ($exitCode -ne 0) { $detail=(($output | Out-String).Trim()); throw ('AVANTIQO_LOCAL_MEDIA_PROCESS_FAILED:' + $detail) }
    $json=(($output | Out-String).Trim()); if (-not $json) { throw 'AVANTIQO_LOCAL_MEDIA_OUTPUT_REQUIRED' }
    $result=$json | ConvertFrom-Json; $elapsed=[int](((Get-Date)-$started).TotalMilliseconds)
    $result | Add-Member -NotePropertyName node_id -NotePropertyValue $NodeId -Force
    CompleteJob $Job $result @{ elapsed_ms=$elapsed; cpu_workload=$true; media_ffmpeg=$true }
  } finally { Remove-Item -Force -ErrorAction SilentlyContinue $tmp }
}

$lastHeartbeat = [DateTime]::MinValue
while ($true) {
  try {
    if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 30) { Heartbeat; $lastHeartbeat = Get-Date }
    $jobs = ClaimJobs
    foreach ($job in $jobs) {
      try {
        if ([string]$job.capability -eq 'ai.text.generate') { RunTextJob $job }
        elseif ([string]$job.capability -eq 'ai.audio.elastic-warp') { RunElasticJob $job }
        elseif ([string]$job.capability -eq 'media.ffmpeg.process') { RunMediaJob $job }
        elseif ([string]$job.capability -eq 'ai.speech.to.text') { RunVoiceSttJob $job }
        elseif ([string]$job.capability -eq 'ai.image.upscale') { RunImageUpscaleJob $job }
        else { FailJob $job 'AVANTIQO_LOCAL_CAPABILITY_UNSUPPORTED' $false }
      } catch {
        FailJob $job (('AVANTIQO_LOCAL_WORKER_JOB_FAILED:' + $_.Exception.Message).Substring(0,[Math]::Min(480,('AVANTIQO_LOCAL_WORKER_JOB_FAILED:' + $_.Exception.Message).Length))) $true
      }
    }
  } catch {
    Start-Sleep -Seconds 5
  }
  Start-Sleep -Seconds 2
}

