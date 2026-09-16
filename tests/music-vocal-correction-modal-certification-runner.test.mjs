import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runner = fs.readFileSync(new URL("../scripts/run-avantiqo-music-vocal-correction-certification-local.mjs", import.meta.url), "utf8");
const wrapper = fs.readFileSync(new URL("../scripts/run-avantiqo-music-vocal-correction-certification-safe-lease-local.sh", import.meta.url), "utf8");

test("vocal correction certification has THB spend watchdog and measured economics", () => {
  assert.match(runner, /CERTIFICATION_SPEND_CEILING_THB_REQUIRED/);
  assert.match(runner, /SPEND_CEILING_WATCHDOG/);
  assert.match(runner, /call\.cancel/);
  assert.match(runner, /conservative_supplier_cost_thb/);
});

test("vocal certification runner is exact-plan Modal direct and human-review gated", () => {
  assert.match(runner, /AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_V2/);
  assert.match(runner, /AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED/);
  assert.match(runner, /AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED/);
  assert.match(runner, /approved_tuning_plan: tuningPlan/);
  assert.match(runner, /approved_timing_plan: timingPlan/);
  assert.match(runner, /source_window: sourceWindow/);
  assert.match(runner, /functions\.fromName\(APP_NAME, FUNCTION_NAME/);
  assert.match(runner, /MUSICIAN_APPROVED_PLAN/);
  assert.match(runner, /tuningEvidence\.fingerprint !== fingerprint\(tuningPlan\)/);
  assert.match(runner, /timingEvidence\?\.fingerprint !== fingerprint\(timingPlan\)/);
  assert.match(runner, /automatic_timing_forbidden: true/);
  assert.match(runner, /human_review: \{ required: true, status: "PENDING", automatic_approval_forbidden: true \}/);
  assert.match(runner, /production_certified: false/);
  assert.doesNotMatch(runner, /RUNPOD|SAFE_LEASE|rest\.runpod\.io/i);
});

test("legacy safe-lease filename is only a compatibility alias to Modal certification", () => {
  assert.match(wrapper, /MODAL_DIRECT_COMPATIBILITY_ALIAS/);
  assert.match(wrapper, /run-avantiqo-music-vocal-correction-certification-local\.mjs/);
  assert.match(wrapper, /prepare-avantiqo-music-vocal-correction-human-review\.mjs/);
  assert.match(wrapper, /PRODUCTION_ACTIVATION=false/);
  assert.doesNotMatch(wrapper, /run-avantiqo-runpod|--lane=|workersMax|workersMin/);
});

import { readFile as readFixture } from "node:fs/promises";
test("vocal correction certification template is Modal-direct and rights-safe", async () => {
  const fixture = await readFixture("audits/examples/avantiqo-music-vocal-correction-certification-request.example.json", "utf8");
  assert.match(fixture, /AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_REQUEST_V2/);
  assert.match(fixture, /AVANTIQO_AUDIO_MODAL_A10G_V1/);
  assert.match(fixture, /isolated_vocal_source_required/);
  assert.match(fixture, /minimum_human_quality_score/);
  assert.doesNotMatch(fixture, /RUNPOD|SAFE_LEASE/i);
});
