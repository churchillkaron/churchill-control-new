import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("retired monolithic owned-engine benchmark stays retired", () => {
  assert.equal(fs.existsSync("scripts/benchmark-avantiqo-owned-engines.mjs"), false);
});

test("current owned media certification is explicit local core certification", () => {
  const suite = fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs", "utf8");
  assert.match(suite, /AVANTIQO_OWNED_MEDIA_CORE_LOCAL_CERTIFICATION_V2/);
  assert.match(suite, /ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
  assert.match(suite, /generation_performed: false/);
  assert.match(suite, /quality_review_required: true/);
  assert.match(suite, /economics_measurement_required: true/);
  assert.match(suite, /production_certified: false/);
  assert.match(suite, /production_activation_performed: false/);
  assert.match(suite, /production_deploy_performed: false/);
  assert.match(suite, /fail_closed: true/);
});

test("other owned engines retain dedicated certification entrypoints", () => {
  for (const file of [
    "scripts/avantiqo-intelligence-benchmark.mjs",
    "scripts/run-avantiqo-voice-stt-local-certification.mjs",
    "scripts/certify-avantiqo-music-local.sh",
    "scripts/certify-avantiqo-code-sandbox-local.mjs",
  ]) {
    assert.equal(fs.existsSync(file), true, file);
  }
});
