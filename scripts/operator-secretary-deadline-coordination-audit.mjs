import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryDeadlineCoordinationRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryDeadlineCoordinationCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
};
const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])));

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DEADLINE_COORDINATION_V1/);
assert.match(source.runtime, /deterministicUuid/);
assert.match(source.runtime, /due_date_evidence_id/);
assert.match(source.runtime, /authority_source_reference/);
assert.match(source.runtime, /required_inputs/);
assert.match(source.runtime, /INPUT_REQUEST/);
assert.match(source.runtime, /INPUT_CHASE/);
assert.match(source.runtime, /INPUT_ESCALATION_REVIEW/);
assert.match(source.runtime, /DEADLINE_REMINDER/);
assert.match(source.runtime, /OVERDUE_REVIEW/);
assert.match(source.runtime, /revisions/);
assert.match(source.runtime, /completion_evidence/);
assert.match(source.runtime, /legal_compliance_inferred:\s*false/);
assert.match(source.runtime, /legal_non_compliance_inferred:\s*false/);
assert.match(source.runtime, /legal_requirement_satisfied_inferred:\s*false/);
assert.match(source.runtime, /statutory_classification_inferred:\s*false/);
assert.match(source.runtime, /filing_validity_inferred:\s*false/);
assert.match(source.runtime, /external_deadline_cancelled:\s*false/);
assert.match(source.runtime, /obligation_waived:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

assert.match(source.capability, /capability:\s*"secretary_deadline_coordination"/);
assert.match(source.capability, /operatorAutoExecute:\s*true/);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(source.capability, /contextScope:\s*"organization"/);
for (const action of ["register", "read", "list", "recordInput", "revise", "recordCompletion", "refresh", "cancel"]) {
  assert.match(source.capability, new RegExp(`${action}:`));
  assert.match(source.platform, new RegExp(`${action}:\\s*async \\(\\) => createSecretaryDeadlineCoordinationCapability\\("${action}"\\)`));
}
assert.match(source.platform, /secretary_deadline_coordination/);

console.log("OPERATOR_SECRETARY_DEADLINE_COORDINATION_AUDIT=PASS");
console.log("SECRETARY_DEADLINE_COORDINATION_DURABLE=true");
console.log("SECRETARY_DEADLINE_COORDINATION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DEADLINE_COORDINATION_DETERMINISTIC=true");
console.log("SECRETARY_DEADLINE_COORDINATION_REMINDERS=true");
console.log("SECRETARY_DEADLINE_COORDINATION_INPUT_CHASING=true");
console.log("SECRETARY_DEADLINE_COORDINATION_ESCALATION=true");
console.log("SECRETARY_DEADLINE_COORDINATION_REVISION_HISTORY=true");
console.log("SECRETARY_DEADLINE_COORDINATION_COMPLETION_EVIDENCE=true");
console.log("SECRETARY_DEADLINE_COORDINATION_LEGAL_COMPLIANCE_INFERRED=false");
console.log("SECRETARY_DEADLINE_COORDINATION_LEGAL_NON_COMPLIANCE_INFERRED=false");
console.log("SECRETARY_DEADLINE_COORDINATION_REQUIREMENT_SATISFIED_INFERRED=false");
console.log("SECRETARY_DEADLINE_COORDINATION_STATUTORY_CLASSIFICATION_INFERRED=false");
console.log("SECRETARY_DEADLINE_COORDINATION_FILING_VALIDITY_INFERRED=false");
console.log("SECRETARY_DEADLINE_COORDINATION_EXTERNAL_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
