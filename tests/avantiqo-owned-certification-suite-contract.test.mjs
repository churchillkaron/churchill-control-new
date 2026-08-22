import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const suite = fs.readFileSync(
  new URL("../scripts/benchmark-avantiqo-owned-engines.mjs", import.meta.url),
  "utf8",
);

for (const engine of ["intelligence", "image", "cinema", "voice", "music", "code"]) {
  test(`unified suite includes ${engine} benchmark`, () => {
    assert.match(suite, new RegExp(`id:\\s*\\?"${engine}\\?"`));
    assert.match(suite, new RegExp(`benchmark-avantiqo-${engine}\\.mjs`));
  });
}

test("intelligence uses dedicated non-queue certification contract", () => {
  assert.match(suite, /AVANTIQO_INTELLIGENCE_NON_QUEUE_CERTIFICATION_V1/);
  assert.doesNotMatch(suite, /DEDICATED_NON_QUEUE_CONTAMINATING_CERTIFICATION_PROBE_REQUIRED/);
});

test("suite cannot activate pricing or provider selection", () => {
  assert.match(suite, /activation_allowed:false/);
  assert.match(suite, /pricing_activation_performed:false/);
  assert.match(suite, /provider_selection_changed:false/);
  assert.match(suite, /automatic_activation_forbidden:true/);
});

test("production certification always requires benchmark and economics evidence", () => {
  assert.match(suite, /benchmark_required:true/);
  assert.match(suite, /economics_required:true/);
  assert.match(suite, /pricing_status_required:"PRODUCTION_CERTIFIED"/);
});
