import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("../lib/operator/secretary/SecretarySignatureRoutingRuntime.js", import.meta.url), "utf8");
const capability = fs.readFileSync(new URL("../lib/platform/capabilities/createSecretarySignatureRoutingCapability.js", import.meta.url), "utf8");
const platform = fs.readFileSync(new URL("../lib/platform/runtime/PlatformDomainRuntime.js", import.meta.url), "utf8");
const pkg = fs.readFileSync(new URL("../package.json", import.meta.url), "utf8");
const wrapper = fs.readFileSync(new URL("./run-operator-secretary-meeting-local-certification.sh", import.meta.url), "utf8");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_SIGNATURE_ROUTING_V1/);
assert.match(runtime, /PARALLEL/);
assert.match(runtime, /SEQUENTIAL/);
assert.match(runtime, /SIGNATURE_EVIDENCE_RECORDED/);
assert.match(runtime, /SIGNER_DECLINE_RECORDED/);
assert.match(runtime, /SIGNATURE_REMINDER_SCHEDULED/);
assert.match(runtime, /COLLECTION_DEADLINE_PASSED/);
assert.match(runtime, /signature_performed_by_secretary:\s*false/);
assert.match(runtime, /signature_authority_created:\s*false/);
assert.match(runtime, /signer_identity_verified_inferred:\s*false/);
assert.match(runtime, /signature_validity_inferred:\s*false/);
assert.match(runtime, /consent_inferred:\s*false/);
assert.match(runtime, /terms_accepted_by_secretary:\s*false/);
assert.match(runtime, /document_modified_by_secretary:\s*false/);
assert.match(runtime, /legal_effect_inferred:\s*false/);
assert.match(runtime, /external_signature_revocation_performed:\s*false/);
assert.match(runtime, /payment_authority_created:\s*false/);
assert.match(runtime, /binding_authority_delegated:\s*false/);
assert.match(runtime, /SECRETARY_SIGNATURE_ROUTING_CONCURRENT_UPDATE_RETRY_REQUIRED/);
assert.match(runtime, /\.eq\("updated_at", task\.updated_at\)/);
assert.match(runtime, /SECRETARY_SIGNATURE_ROUTING_EVIDENCE_REUSE_CONFLICT/);

for (const action of ["start", "recordSignature", "recordDecline", "remind", "refresh", "cancel", "read", "list"]) {
  assert.match(capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(capability, /capability: "secretary_signature_routing"/);
assert.match(capability, /operatorAutoExecute: true/);
assert.match(capability, /operatorRequiresConfirmation: false/);
assert.match(capability, /approval: \{ required: false \}/);
assert.match(platform, /createSecretarySignatureRoutingCapability/);
assert.match(platform, /secretary_signature_routing/);
assert.match(pkg, /operator-secretary-signature-routing-audit\.mjs/);
assert.match(wrapper, /certify-secretary-signature-routing-local\.mjs/);

console.log("OPERATOR_SECRETARY_SIGNATURE_ROUTING_AUDIT=PASS");
console.log("SECRETARY_SIGNATURE_ROUTING_PARALLEL_AND_SEQUENTIAL=true");
console.log("SECRETARY_SIGNATURE_ROUTING_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_SIGNATURE_ROUTING_REMINDERS=true");
console.log("SECRETARY_SIGNATURE_ROUTING_DECLINES=true");
console.log("SECRETARY_SIGNATURE_ROUTING_TEMPORAL_EXPIRY=true");
console.log("SECRETARY_SIGNATURE_ROUTING_SIGNATURE_PERFORMED_BY_SECRETARY=false");
console.log("SECRETARY_SIGNATURE_ROUTING_SIGNATURE_VALIDITY_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_CONSENT_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_LEGAL_EFFECT_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
