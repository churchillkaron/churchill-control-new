import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const local = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicLocalNodeProvider.js", import.meta.url), "utf8");
const audio = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../services/avantiqo-music-local/node01_worker.ps1", import.meta.url), "utf8");
const cpuRunner = fs.readFileSync(new URL("../services/avantiqo-music-local/ace_step_cpu_runner.py", import.meta.url), "utf8");

test("Music local node provider is explicitly certification gated and health checked", () => {
  assert.match(local, /AVANTIQO_MUSIC_LOCAL_NODE_ENABLED/);
  assert.match(local, /AVANTIQO_MUSIC_LOCAL_NODE_LIVE_ACCEPTANCE_ENABLED/);
  assert.match(local, /AVANTIQO_MUSIC_LOCAL_NODE_PRODUCTION_CERTIFIED/);
  assert.match(local, /process\.env\.NODE_ENV === "production"/);
  assert.match(local, /avantiqo_local_compute_nodes/);
  assert.match(local, /NODE_FRESHNESS_MS = 120_000/);
});

test("Music local node provider queues generation, separator and vocal correction on owned Node 01", () => {
  assert.match(local, /ai\.music\.generate/);
  assert.match(local, /music_generation/);
  assert.match(local, /lane: "cpu"/);
  assert.match(local, /ACE_STEP_1_5_CPU_FLOAT32_LOCAL_V1/);
  assert.match(local, /ai\.audio\.stems/);
  assert.match(local, /music_separator/);
  assert.match(local, /ai\.audio\.vocal-correct/);
  assert.match(local, /music_vocal_correction/);
  assert.match(local, /avantiqo_local_compute_jobs/);
  assert.match(local, /AVANTIQO_LOCAL_NODE_V1/);
});

test("Avantiqo audio prefers a healthy governed local Music node and retains Modal fallback", () => {
  assert.match(audio, /isMusicGenerationCapability/);
  assert.match(audio, /AvantiqoMusicLocalNodeProvider\.available/);
  assert.match(audio, /MODAL_GENERATION_WORKER\.execute/);
  assert.match(audio, /AvantiqoMusicSeparatorModalProvider\.execute/);
  assert.match(audio, /AvantiqoMusicVocalCorrectionModalProvider\.execute/);
  assert.match(audio, /AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX/);
  assert.match(audio, /local_only/);
});


test("tracked Node 01 worker routes Music generation to the heavy CPU lane", () => {
  assert.match(worker, /powershell-v4-scheduler/);
  assert.match(worker, /\$CpuCapabilities = @\([^\n]*'ai\.music\.generate'/);
  assert.match(worker, /music_generation/);
  assert.match(worker, /mode='CPU_FLOAT32'/);
  assert.match(worker, /function RunMusicGenerationJob/);
  assert.match(worker, /ai\.music\.generate'\) \{ RunMusicGenerationJob \$job \}/);
  assert.match(worker, /p_lease_seconds=\$\(if \(\$Lane -eq 'cpu'.*1800/);
  assert.match(worker, /renew_avantiqo_local_compute_job_lease/);
  assert.match(worker, /TotalSeconds -ge 240/);
  assert.match(worker, /supplier_cost_thb=0/);
});

test("tracked ACE-Step runner is CPU float32 local generation with private signed output", () => {
  assert.match(cpuRunner, /device="cpu"/);
  assert.match(cpuRunner, /ACE_STEP_1_5_CPU_FLOAT32_LOCAL_V1/);
  assert.match(cpuRunner, /LOCAL_CPU_FLOAT32/);
  assert.match(cpuRunner, /supplier_cost_thb/);
  assert.match(cpuRunner, /put_file\(upload_url, path\)/);
});
