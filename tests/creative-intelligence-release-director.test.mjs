import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const director = await readFile(
  new URL("../lib/creative/quality/runtime/CreativeIntelligenceReleaseDirectorRuntime.js", import.meta.url),
  "utf8",
);
const router = await readFile(
  new URL("../lib/creative/finalisation/runtime/CreativeFinalisationRouter.js", import.meta.url),
  "utf8",
);

test("Intelligence release director can downgrade but never upgrade failed specialist quality", () => {
  assert.match(director, /UNDERLYING_QUALITY_NOT_PASSED/);
  assert.match(director, /can_upgrade_failed_quality:\s*false/);
  assert.match(director, /specialist_quality_gates_are_authoritative:\s*true/);
  assert.match(director, /INTELLIGENCE_REPAIR_REQUIRED/);
  assert.match(director, /prefer_bounded_repair_over_full_regeneration:\s*true/);
  assert.doesNotMatch(director, /can_upgrade_failed_quality:\s*true/);
});

test("Temporal and universal finalisation both pass specialist verdicts through Intelligence review", () => {
  assert.match(router, /CreativeIntelligenceReleaseDirectorRuntime/);
  assert.match(router, /result:\s*specialistVerdict/);
  assert.match(router, /workflow\.finaliser === "TEMPORAL"/);
  assert.match(router, /workflow\.finaliser === "UNIVERSAL"/);
});
