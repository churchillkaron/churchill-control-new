import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Object.freeze({
  director: "lib/creative/music/runtime/CreativeMusicAutoStudioRuntime.js",
  executor: "lib/creative/music/runtime/CreativeMusicAutoStudioExecutionRuntime.js",
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
    "Local master complete",
    "Full elite Auto Studio still requires",
  ]);
  hasAll(workspace, [
    '{ id: "auto", label: "Auto Studio"',
    'useState("auto")',
  ]);
});

test("local Auto Studio finishing stays provider-free and canonical", async () => {
  const [executor, route] = await Promise.all([
    source(files.executor),
    source(files.route),
  ]);

  hasAll(executor, [
    'type: "GENERATE_AUDIO"',
    'type: "EXECUTE_CAPABILITY"',
    'capability: "creative.audio.finish"',
    "dispatchAudioTask(finishTask)",
    "local_execution: true",
    "runpod_used: false",
    "provider_job_submitted: false",
    "endpoint_mutation_performed: false",
    "safe_lease_required_for_this_execution: false",
  ]);
  hasAll(route, [
    'action === "execute_local"',
    "resolveCreativeProviderAssetUrl",
    "private_master_url",
    "private_waveform_url",
    "Cache-Control",
  ]);

  assert.equal(/workersMax\s*[:=]\s*1/.test(executor), false);
  assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(executor), false);
  assert.equal(/executeService\s*\(/.test(executor), false);
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
