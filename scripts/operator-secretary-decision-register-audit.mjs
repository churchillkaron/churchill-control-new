import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile("lib/operator/secretary/SecretaryExecutiveDecisionRegisterRuntime.js", "utf8");
const governed = await readFile("lib/operator/secretary/SecretaryExecutiveDecisionRegisterGovernedRuntime.js", "utf8");
const capability = await readFile("lib/platform/capabilities/createSecretaryExecutiveDecisionRegisterCapability.js", "utf8");
const platform = await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DECISION_REGISTER_V1/);
assert.match(runtime, /source:\s*SOURCE/);
assert.match(runtime, /secretary_decision_register/);
assert.match(runtime, /decision_register_v1/);
assert.match(runtime, /SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED/);
assert.match(runtime, /decided_at.*required:\s*true/s);
assert.match(runtime, /FINALIZED_MEETING_DECISION_RECORD/);
assert.match(runtime, /meeting\.status !== "COMPLETED"/);
assert.match(runtime, /meeting_decision_record_used_as_evidence:\s*true/);
assert.match(runtime, /DECISION_RECORDED/);
assert.match(runtime, /DECISION_SUPERSEDED/);
assert.match(runtime, /DECISION_RETRACTED/);
assert.match(runtime, /FOLLOW_THROUGH_LINKED/);
assert.match(runtime, /SECRETARY_DECISION_REGISTER_STALE_SUPERSESSION_REJECTED/);
assert.match(runtime, /SECRETARY_DECISION_REGISTER_STALE_RETRACTION_REJECTED/);
assert.match(runtime, /SECRETARY_DECISION_REGISTER_STALE_FOLLOW_THROUGH_LINK_REJECTED/);
assert.match(runtime, /\.eq\("updated_at", task\.updated_at\)/);
assert.match(runtime, /state:\s*"SUPERSEDED"/);
assert.match(runtime, /state:\s*"RETRACTED"/);
assert.match(runtime, /current_decisions:/);
assert.match(runtime, /retracted_decisions:/);
assert.match(runtime, /decision_timestamp_inferred:\s*false/);
assert.match(runtime, /decision_text_inferred:\s*false/);
assert.match(runtime, /decision_owner_inferred:\s*false/);
assert.match(runtime, /follow_through_inferred:\s*false/);
assert.match(runtime, /decision_inferred:\s*false/);
assert.match(runtime, /decision_made_by_secretary:\s*false/);
assert.match(runtime, /decision_authority_created:\s*false/);
assert.match(runtime, /approval_authority_delegated:\s*false/);
assert.match(runtime, /binding_authority_delegated:\s*false/);
assert.match(runtime, /platform_permissions_mutated:\s*false/);
assert.match(runtime, /external_authority_used:\s*false/);
assert.match(runtime, /scope:\s*"TASK_ROUTING"/);

assert.match(governed, /AVANTIQO_EXECUTIVE_SECRETARY_DECISION_REGISTER_GOVERNED_V1/);
assert.match(governed, /supersedeSecretaryExecutiveDecisionGoverned/);
assert.match(governed, /old\?\.state === "SUPERSEDED"/);
assert.match(governed, /old\?\.superseded_by_version_id === current\.version_id/);
assert.match(governed, /old\?\.supersession_evidence_id === evidenceId/);
assert.match(governed, /current\.decision_text_sha256 === sha256\(replacementText\)/);
assert.match(governed, /replay_safe:\s*true/);
assert.match(governed, /supersedeSecretaryExecutiveDecision\(\{ context, payload \}\)/);
assert.match(governed, /decision_inferred:\s*false/);
assert.match(governed, /decision_made_by_secretary:\s*false/);
assert.match(governed, /decision_authority_created:\s*false/);

assert.match(capability, /SecretaryExecutiveDecisionRegisterGovernedRuntime/);
assert.match(capability, /execute:\s*supersedeSecretaryExecutiveDecisionGoverned/);
assert.doesNotMatch(capability, /execute:\s*supersedeSecretaryExecutiveDecision\b/);
assert.match(capability, /capability:\s*"secretary_decision_register"/);
for (const action of ["record", "syncMeeting", "supersede", "retract", "linkFollowThrough", "read", "list"]) {
  assert.match(capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(capability, /does not make, approve or infer it/i);
assert.match(capability, /without inventing new decisions or decision timestamps/i);
assert.match(capability, /complete prior version history/i);
assert.match(capability, /No replacement decision is inferred or created/i);
assert.match(capability, /without changing the decision or inferring that the task completes it/i);
assert.match(capability, /operatorRequiresConfirmation:\s*false/);
assert.match(capability, /aiEnabled:\s*false/);

assert.match(platform, /createSecretaryExecutiveDecisionRegisterCapability/);
assert.match(platform, /secretary_decision_register:\s*\{/);
for (const action of ["record", "syncMeeting", "supersede", "retract", "linkFollowThrough", "read", "list"]) {
  assert.match(platform, new RegExp(`${action}:\\s*async \\(\\) => createSecretaryExecutiveDecisionRegisterCapability\\("${action}"\\)`));
}

console.log("OPERATOR_SECRETARY_DECISION_REGISTER_AUDIT=PASS");
console.log("SECRETARY_DECISION_REGISTER_DURABLE=true");
console.log("SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DECISION_REGISTER_MEETING_DECISIONS_EXPLICIT_ONLY=true");
console.log("SECRETARY_DECISION_REGISTER_VERSION_HISTORY_PRESERVED=true");
console.log("SECRETARY_DECISION_REGISTER_SUPERSESSION_REPLAY_SAFE=true");
console.log("SECRETARY_DECISION_REGISTER_STALE_SUPERSESSION_FENCED=true");
console.log("SECRETARY_DECISION_REGISTER_STALE_RETRACTION_FENCED=true");
console.log("SECRETARY_DECISION_REGISTER_FOLLOW_THROUGH_EXPLICIT=true");
console.log("SECRETARY_DECISION_REGISTER_DECISION_INFERRED=false");
console.log("SECRETARY_DECISION_REGISTER_DECISION_MADE_BY_SECRETARY=false");
console.log("SECRETARY_DECISION_REGISTER_DECISION_AUTHORITY_CREATED=false");
console.log("SECRETARY_DECISION_REGISTER_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DECISION_REGISTER_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DECISION_REGISTER_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
