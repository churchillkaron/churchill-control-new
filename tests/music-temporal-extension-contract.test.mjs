import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicTemporalExtensionContract, validateMusicTemporalExtensionResult } from "../lib/creative/music/runtime/CreativeMusicTemporalExtensionContractRuntime.js";

test("temporal extension contract is exact, non-destructive and revalidation-bound", () => {
  const contract = buildMusicTemporalExtensionContract({ master_asset_id: "master-7", master_version_id: "v7", extension_seconds: 47, continuity_overlap_seconds: 6 });
  assert.equal(contract.capability, "ai.audio.extend");
  assert.equal(contract.task_type, "repaint");
  assert.equal(contract.strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT");
  assert.equal(contract.source_asset_id, "master-7");
  assert.equal(contract.source_version_id, "v7");
  assert.equal(contract.extension_seconds, 47);
  assert.equal(contract.continuity_overlap_seconds, 6);
  assert.equal(contract.preserve_source_before_overlap, true);
  assert.equal(contract.creates_new_version, true);
  assert.equal(contract.post_render_dailies_required, true);
  assert.equal(contract.post_render_release_manifest_required, true);
  assert.equal(contract.publication_authorized, false);
});

test("temporal extension result must prove audio actually became longer", () => {
  const contract = buildMusicTemporalExtensionContract({ extension_seconds: 30 });
  const pass = validateMusicTemporalExtensionResult({ contract, result: { capability: "ai.audio.extend", task_type: "repaint", temporal_extend_strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT", source_duration_seconds: 90, duration_seconds: 119.8, extension_seconds_effective: 29.8 } });
  assert.equal(pass.passed, true);
  const fail = validateMusicTemporalExtensionResult({ contract, result: { capability: "ai.audio.extend", task_type: "repaint", temporal_extend_strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT", source_duration_seconds: 90, duration_seconds: 90, extension_seconds_effective: 0 } });
  assert.equal(fail.passed, false);
  assert.ok(fail.failures.includes("MUSIC_TEMPORAL_EXTENSION_NOT_OBSERVED"));
});

test("Modal exposes Extend only as a certification candidate while production stays gated", () => {
  const modal = fs.readFileSync("services/avantiqo-audio-modal/modal_app.py", "utf8");
  const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
  assert.match(modal, /CAPABILITIES = .*ai\.audio\.extend/);
  assert.doesNotMatch(registration, /MODAL_MAIN_CAPABILITIES[\s\S]{0,180}ai\.audio\.extend/);
  assert.match(registration, /modal_certification_candidate_available: true/);
  assert.match(provider, /AVANTIQO_MUSIC_TEMPORAL_EXTEND_OUTPAINT_NOT_CERTIFIED/);
});

test("Extend configuration is Modal-native and contains no stale Safe Lease contract", () => {
  const config = JSON.parse(fs.readFileSync("config/avantiqo-music-extend-engine.json", "utf8"));
  assert.equal(config.infrastructure_provider, "MODAL_DIRECT_A10G_ASYNC_V1");
  assert.equal(config.task_type, "repaint");
  assert.equal(config.model_variant, "acestep-v15-xl-turbo");
  assert.equal(config.modal_certification_candidate, true);
  assert.equal(config.production_certified, false);
  assert.equal(config.temporal_extend_routing_allowed, false);
  assert.equal("safe_lease_contract" in config, false);
  assert.equal("safe_lease_lane" in config, false);
});

test("Music Extend route uses the canonical continuation contract and stays fail closed", () => {
  const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");
  assert.match(route, /buildMusicTemporalExtensionContract/);
  assert.match(route, /post_render_dailies_required: true/);
  assert.match(route, /post_render_release_manifest_required: true/);
  assert.match(route, /certification: "BENCHMARK_REQUIRED"/);
  assert.match(route, /executable: false/);
});
