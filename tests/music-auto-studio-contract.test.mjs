import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Object.freeze({
  director: "lib/creative/music/runtime/CreativeMusicAutoStudioRuntime.js",
  executor: "lib/creative/music/runtime/CreativeMusicAutoStudioExecutionRuntime.js",
  vocal: "lib/creative/music/runtime/CreativeMusicVocalEngineeringRuntime.js",
  route: "app/api/creative/music/auto-studio/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicAutoStudioPanel.jsx",
  workspace: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
});

async function source(path) {
  return readFile(path, "utf8");
}

function hasAll(content, markers) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `missing marker: ${marker}`);
  }
}

test("Music Auto Studio is the default full-auto surface", async () => {
  const [director, panel, workspace] = await Promise.all([
    source(files.director),
    source(files.panel),
    source(files.workspace),
  ]);

  hasAll(director, [
    "AVANTIQO_MUSIC_AUTO_STUDIO_V1",
    "MAKE IT PROFESSIONAL",
    "generation_engine_rebuild_required: false",
    "full_auto_studio_ready",
    "ENGINE_COMPLETION_REQUIRED",
    "CERTIFICATION_REQUIRED",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    "direct_workers_max_write_allowed: false",
    "runpod_job_outside_safe_lease_allowed: false",
  ]);
  hasAll(panel, [
    "Full Auto Studio",
    "MAKE IT PROFESSIONAL",
    'action: "execute_local"',
    "Restored master complete",
    "Automatic restoration",
    "Original preserved · V0",
    "Restored source · V1",
    "Remaining elite stages",
  ]);
  hasAll(workspace, [
    '{ id: "auto", label: "Auto Studio"',
    'useState("auto")',
  ]);
});

test("local Auto Studio restoration and finishing stay provider-free and canonical", async () => {
  const [executor, vocal, route] = await Promise.all([
    source(files.executor),
    source(files.vocal),
    source(files.route),
  ]);

  hasAll(executor, [
    "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL_EXECUTION_V2",
    "processMusicVocalEngineeringLocal",
    'type: "GENERATE_AUDIO"',
    'type: "EXECUTE_CAPABILITY"',
    'capability: "creative.music.vocal-engineering.local"',
    'capability: "creative.audio.finish"',
    "music_source_version: 0",
    "music_source_version: 1",
    "dispatchAudioTask(finishTask)",
    "local_restoration_complete",
    "local_execution: true",
    "runpod_used: false",
    "provider_job_submitted: false",
    "endpoint_mutation_performed: false",
    "direct_workers_max_write: false",
    "safe_lease_required_for_this_execution: false",
  ]);
  hasAll(vocal, [
    "AVANTIQO_MUSIC_VOCAL_ENGINEERING_LOCAL_V1",
    "spectralSnapshot",
    "spectral_denoise",
    "adaptive_eq",
    "de_esser",
    "compression",
    "safety_limiter",
    "CERTIFIED_PITCH_LANE_REQUIRED",
    "CERTIFIED_TIMING_LANE_REQUIRED",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    "provider_job_submitted: false",
    "runpod_used: false",
    "endpoint_mutation_performed: false",
    "direct_workers_max_write: false",
  ]);
  hasAll(route, [
    'action === "execute_local"',
    "resolveCreativeProviderAssetUrl",
    "private_master_url",
    "private_waveform_url",
    "Cache-Control",
  ]);

  for (const content of [executor, vocal]) {
    assert.equal(/workersMax\s*[:=]\s*1/.test(content), false);
    assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(content), false);
    assert.equal(/executeService\s*\(/.test(content), false);
  }
});

test("Auto Studio preserves the original and masters from the restored source", async () => {
  const executor = await source(files.executor);
  const original = executor.indexOf("const originalTask = await createSourceTask");
  const restore = executor.indexOf("const restoration = await processMusicVocalEngineeringLocal");
  const restoredTask = executor.indexOf("const restoredTask = await createRestoredSourceTask");
  const finish = executor.indexOf("const finishTask = await createFinishTask");
  assert.ok(original >= 0, "original source task required");
  assert.ok(restore > original, "restoration must follow original preservation");
  assert.ok(restoredTask > restore, "restored source task must follow restoration");
  assert.ok(finish > restoredTask, "mastering must follow restored source creation");
  hasAll(executor, [
    "sourceTask: restoredTask",
    "original_preserved: true",
    "music_auto_studio_original_task_id",
  ]);
});

test("Auto Studio accepts audio and performance-video sources without editing picture", async () => {
  const [director, route] = await Promise.all([
    source(files.director),
    source(files.route),
  ]);

  hasAll(director, [
    '"mp3"',
    '"wav"',
    '"flac"',
    '"mp4"',
    '"mov"',
    "Use the embedded performance audio as the Music Studio source without editing the video picture.",
  ]);
  hasAll(route, [
    'contentType.startsWith("audio/")',
    'contentType.startsWith("video/")',
    "max_source_duration_seconds: 900",
  ]);
});
