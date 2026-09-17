import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicProfessionalProductionManifest } from "../lib/creative/music/runtime/CreativeMusicProfessionalProductionRuntime.js";
import { buildWorldClassMusicStudioPlan } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

test("professional vocal release fails closed until post-production stages exist", () => {
  const result = buildMusicProfessionalProductionManifest({
    plan: { objective: "Create a song with female vocals", selected_capabilities: [{ id: "create_song" }] },
    evidence: { source_generated: true, master_asset_id: "master-1", mastering_passed: true },
  });
  assert.equal(result.vocals_required, true);
  assert.equal(result.release_ready, false);
  assert.ok(result.blockers.includes("STEM_SEPARATION"));
  assert.ok(result.blockers.includes("VOCAL_PRODUCTION"));
  assert.ok(result.blockers.includes("MIX_ENGINEERING"));
});

test("professional instrumental release does not require vocal production", () => {
  const result = buildMusicProfessionalProductionManifest({
    plan: { objective: "Create instrumental music", selected_capabilities: [{ id: "compose_music" }] },
    input: { instrumental: true },
    evidence: {
      source_generated: true, stems_ready: true, mix_passed: true, premaster_qc_passed: true,
      mastering_passed: true, perceptual_translation_passed: true, dailies_passed: true, tribunal_passed: true,
    },
  });
  assert.equal(result.vocals_required, false);
  assert.equal(result.release_ready, true);
});

test("world-class plan exposes professional production contract", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Create a song with female vocals" });
  assert.equal(plan.professional_production.standard, "PROFESSIONAL_RELEASE");
  assert.equal(plan.governance.professional_release_requires_stems, true);
  assert.equal(plan.governance.fast_generation_must_not_be_labeled_professional_master, true);
});

test("world-class execution gates professional release on production manifest", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", import.meta.url), "utf8");
  assert.match(source, /professionalReleaseRequested/);
  assert.match(source, /professionalProduction\.release_ready === true/);
  assert.match(source, /professional_stems_ready/);
  assert.match(source, /professional_vocal_production_passed/);
  assert.match(source, /professional_mix_passed/);
});
