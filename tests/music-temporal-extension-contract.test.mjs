import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildMusicTemporalExtensionContract, validateMusicTemporalExtensionResult } from "../lib/creative/music/runtime/CreativeMusicTemporalExtensionContractRuntime.js";

test("temporal extension contract is exact, non-destructive and revalidation-bound", () => {
  const contract = buildMusicTemporalExtensionContract({ master_asset_id: "master-7", master_version_id: "v7", extension_seconds: 47, continuity_overlap_seconds: 6 });
  assert.equal(contract.capability, "ai.audio.extend");
  assert.equal(contract.strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT");
  assert.equal(contract.creates_new_version, true);
  assert.equal(contract.post_render_dailies_required, true);
  assert.equal(contract.publication_authorized, false);
});

test("temporal extension result must prove audio actually became longer", () => {
  const contract = buildMusicTemporalExtensionContract({ extension_seconds: 30 });
  const pass = validateMusicTemporalExtensionResult({ contract, result: { capability: "ai.audio.extend", task_type: "repaint", temporal_extend_strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT", source_duration_seconds: 90, duration_seconds: 119.8, extension_seconds_effective: 29.8 } });
  assert.equal(pass.passed, true);
  const fail = validateMusicTemporalExtensionResult({ contract, result: { capability: "ai.audio.extend", task_type: "repaint", temporal_extend_strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT", source_duration_seconds: 90, duration_seconds: 90, extension_seconds_effective: 0 } });
  assert.equal(fail.passed, false);
});

test("active production Audio keeps Extend research-only", () => {
  const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
  const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");
  assert.match(registration, /"ai\.audio\.extend"/);
  assert.doesNotMatch(provider, /capability === "ai\.audio\.extend"/);
  assert.match(route, /implementation: "RESEARCH_ONLY"/);
  assert.match(route, /executable: false/);
});
