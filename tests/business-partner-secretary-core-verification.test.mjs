import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryCapability.js", "utf8");
const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
const runtime = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const cert = fs.readFileSync("scripts/certify-business-partner-write-verification-coverage-local.mjs", "utf8");

test("core Secretary writes declare exact authoritative verifiers", () => {
  for (const action of ["createCalendarEvent","updateCalendarEvent","createContact","upsertContactProfile","createTask","updateTask","createFollowUp","updateSettings"]) {
    assert.match(capability, new RegExp(`${action}: \{ capability_key:`));
  }
  for (const key of ["secretary_calendar_event","secretary_contact","secretary_task","secretary_follow_up","secretary_settings"]) {
    assert.match(runtime, new RegExp(`${key}: \{ read:`));
  }
  assert.match(verifier, /AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1/);
  assert.match(verifier, /safe_to_retry: !data/);
  assert.match(verifier, /SECRETARY_VERIFICATION_SCOPE_MISMATCH/);
});

test("Secretary legacy read and list actions declare read mode", () => {
  for (const file of [
    "createSecretaryDocumentTransmittalCapability.js",
    "createSecretaryPhysicalKeyBadgeCustodyCapability.js",
    "createSecretaryOfficeArtifactPreparationCapability.js",
    "createSecretaryWrittenActionAdministrationCapability.js",
    "createSecretaryPhysicalRecordsCustodyCapability.js",
  ]) {
    const source = fs.readFileSync(`lib/platform/capabilities/${file}`, "utf8");
    assert.match(source, /operatorMode: \["read", "list"\]\.includes/);
  }
  assert.match(cert, /secretary_core_mutations_have_exact_verification/);
  assert.match(cert, /secretary_read_list_actions_are_not_writes/);
});
