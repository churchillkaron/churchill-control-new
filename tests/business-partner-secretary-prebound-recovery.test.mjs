import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { secretaryPreboundMutationResult } from "../lib/operator/secretary/SecretaryPreboundMutationRuntime.mjs";

const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const runtimeFiles = [
  "SecretaryAppointmentAttendanceStewardshipRuntime.js",
  "SecretaryHospitalityCoordinationRuntime.js",
  "SecretaryDocumentTransmittalRuntime.js",
  "SecretaryMeetingPackCoordinationRuntime.js",
  "SecretaryOfficeArtifactPreparationRuntime.js",
  "SecretaryAccessMediaCustodyRuntime.js",
  "SecretaryPhysicalRecordsCustodyRuntime.js",
  "SecretaryWrittenActionAdministrationRuntime.js",
].map((name) => fs.readFileSync(`lib/operator/secretary/${name}`, "utf8"));

test("eight internal Secretary create actions use prebound exact recovery", () => {
  assert.equal((platform.match(/ambiguousWriteRecovery: "PREBOUND_EXACT_ID"/g) || []).length, 8);
  assert.equal((platform.match(/recovery_payload_from_evidence: \{ task_id: "task_id" \}/g) || []).length, 8);
});

test("prebound Secretary task inserts attach identity only on insert failure", () => {
  assert.equal(runtimeFiles.filter((src) => /secretaryPreboundMutationResult[\s\S]*"task_id"/.test(src)).length, 8);
});

test("prebound helper preserves fail-closed mutation semantics", async () => {
  const error = new Error("db ambiguous");
  await assert.rejects(
    secretaryPreboundMutationResult(Promise.resolve({ error }), "task_id", "abc-123"),
    (caught) => caught.action_identity_evidence?.includes("task_id:abc-123") && caught.mutation_completion_proven === false,
  );
  const success = await secretaryPreboundMutationResult(Promise.resolve({ data: { id: "abc-123" }, error: null }), "task_id", "abc-123");
  assert.equal(success.data.id, "abc-123");
});

test("action identity cert locks eight prebound Secretary creates", () => {
  const cert = fs.readFileSync("scripts/certify-business-partner-action-identity-coverage-local.mjs", "utf8");
  assert.match(cert, /secretary_prebound_exact_recovery/);
  assert.match(cert, /secretary_remaining_fail_closed/);
  assert.match(cert, /secretaryPrebound\.length === 8/);
});
