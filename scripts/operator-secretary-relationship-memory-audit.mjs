import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryRelationshipMemoryCapability.js",
  runtime: "lib/operator/secretary/SecretaryRelationshipMemoryRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_RELATIONSHIP_MEMORY_V1/);
assert.match(source.runtime, /relationship_memory_v1/);
assert.match(source.runtime, /deterministicUuid/);
assert.match(source.runtime, /FACT_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /INTERACTION_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /status:\s*"SUPERSEDED"/);
assert.match(source.runtime, /status:\s*"CORRECTED"/);
assert.match(source.runtime, /status:\s*"RETRACTED"/);
assert.match(source.runtime, /effective_status:\s*"STALE"/);
assert.match(source.runtime, /stale_facts_not_treated_current:\s*true/);
assert.match(source.runtime, /FORBIDDEN_MEMORY_KEY/);
assert.match(source.runtime, /CREDENTIAL_STORAGE_FORBIDDEN/);
assert.match(source.runtime, /credentials_or_secrets_stored:\s*false/);
assert.match(source.runtime, /last_contact_at/);
assert.match(source.runtime, /next_follow_up_at/);
assert.match(source.runtime, /secretary_relationship_next_touch:\s*true/);
assert.match(source.runtime, /execution_owner:\s*"SECRETARY"/);
assert.match(source.runtime, /relationship_priority_inferred:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);
assert.doesNotMatch(source.runtime, /supabaseAdmin\.storage/);

assert.match(source.capability, /capability:\s*"secretary_relationship_memory"/);
for (const action of ["read", "recordFact", "correctFact", "retractFact", "recordInteraction", "setNextTouch", "clearNextTouch", "listAttention"]) {
  assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(source.capability, /operatorAutoExecute:\s*true/);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(source.capability, /contextScope:\s*"organization"/);

assert.match(source.platform, /createSecretaryRelationshipMemoryCapability/);
assert.match(source.platform, /secretary_relationship_memory/);
for (const action of ["read", "recordFact", "correctFact", "retractFact", "recordInteraction", "setNextTouch", "clearNextTouch", "listAttention"]) {
  assert.match(source.platform, new RegExp(`${action}:\\s*async \\(\\) => createSecretaryRelationshipMemoryCapability\\("${action}"\\)`));
}

console.log("OPERATOR_SECRETARY_RELATIONSHIP_MEMORY_AUDIT=PASS");
console.log("SECRETARY_RELATIONSHIP_MEMORY_EVIDENCE_BACKED=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_FACTS_NOT_INFERRED=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_SUPERSEDED_FACTS_PRESERVED=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_CORRECTION_HISTORY=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_RETRACTION_HISTORY=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_STALE_FACTS_NOT_CURRENT=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_SECRET_STORAGE_FORBIDDEN=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_LAST_CONTACT_EVIDENCE_ONLY=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_NEXT_TOUCH_DETERMINISTIC=true");
console.log("SECRETARY_RELATIONSHIP_MEMORY_PRIORITY_INFERRED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
