import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime.js", import.meta.url),
  "utf8",
);

test("bridged learning candidates retire only after authenticated agenda persistence", () => {
  assert.ok(runtime.includes("createAvantiqoLearningMechanismAgendaAuthenticityVerifier"));
  assert.ok(runtime.includes("PERSISTED_AUTHENTICITY_REQUIRED"));
  assert.ok(runtime.includes("BRIDGED_TO_AUTHENTICATED_MECHANISM_AGENDA"));
  assert.ok(runtime.includes("bridge_retention_state: \"COMPACT_BRIDGED_PROVENANCE\""));
  assert.ok(runtime.includes("active: false"));
  assert.ok(runtime.includes("superseded_by"));
});

test("retired candidate provenance is physically bounded", () => {
  assert.ok(runtime.includes("MAX_RETIRED_CANDIDATE_PROVENANCE = 300"));
  assert.ok(runtime.includes("trimRetiredCandidateProvenance"));
  assert.ok(runtime.includes(".delete()"));
  assert.ok(runtime.includes("retired_candidate_provenance_trimmed_count"));
});
