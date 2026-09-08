import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = fs.readFileSync("lib/creative/research/runtime/ResearchEvidenceContractRuntime.js", "utf8");
const director = fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js", "utf8");

test("real-world grounding rejects malformed evidence, webpage media, and invented public rights", () => {
  assert.match(evidence, /CREATIVE_GROUNDING_MODE_INVALID/);
  assert.match(evidence, /CREATIVE_GROUNDING_STRUCTURED_EVIDENCE_REQUIRED/);
  assert.match(evidence, /CREATIVE_GROUNDING_EVIDENCE_REQUIRED/);
  assert.match(evidence, /CREATIVE_GROUNDING_DIRECT_MEDIA_URL_REQUIRED/);
  assert.match(evidence, /CREATIVE_GROUNDING_PUBLIC_RIGHTS_UNVERIFIED/);
  assert.match(evidence, /canonicalComparableUrl/);
  assert.match(evidence, /directMediaUrl/);
});

test("research discovery explicitly seeks category competitors instead of name collisions", () => {
  assert.match(director, /competitors alternatives category leaders/);
  assert.match(director, /market comparison enterprise platform/);
});

test("evidence collection is round-robin across discovery intents and competitors require citations", () => {
  assert.match(director, /for \(let rank = 0; rank < 12; rank \+= 1\)/);
  assert.match(director, /queryResults/);
  assert.match(evidence, /COMPETITOR_ANALYSIS_INVALID_SOURCES/);
  assert.match(evidence, /COMPETITOR_ANALYSIS_EVIDENCE_REQUIRED/);
});
