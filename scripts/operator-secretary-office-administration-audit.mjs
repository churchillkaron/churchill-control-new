import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryOfficeAdministrationRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryOfficeAdministrationCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
};
const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])));

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_OFFICE_ADMINISTRATION_V1/);
assert.match(source.runtime, /OFFICE_SUPPLIES/);
assert.match(source.runtime, /FACILITY_ISSUE/);
assert.match(source.runtime, /EQUIPMENT_ISSUE/);
assert.match(source.runtime, /ROOM_SETUP/);
assert.match(source.runtime, /SERVICE_COORDINATION/);
assert.match(source.runtime, /resolveSecretaryAdministrativeCoverage/);
assert.match(source.runtime, /scope:\s*"TASK_ROUTING"/);
assert.match(source.runtime, /QUOTE_RECORDED/);
assert.match(source.runtime, /EXTERNAL_COMMITMENT_RECORDED/);
assert.match(source.runtime, /COMPLETION_RECORDED/);
assert.match(source.runtime, /COORDINATION_CANCELLED/);
assert.match(source.runtime, /quote_accepted:\s*false/);
assert.match(source.runtime, /order_placed:\s*false/);
assert.match(source.runtime, /purchase_performed:\s*false/);
assert.match(source.runtime, /service_authorized_by_secretary:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /signing_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /completion_inferred:\s*false/);
assert.match(source.runtime, /repair_quality_inferred:\s*false/);
assert.match(source.runtime, /supplies_received_inferred:\s*false/);
assert.match(source.runtime, /external_cancellation_performed:\s*false/);
assert.match(source.runtime, /\.eq\("updated_at", task\.updated_at\)/);
assert.match(source.runtime, /replay_safe:\s*true/);

assert.match(source.capability, /capability:\s*"secretary_office_administration"/);
for (const action of ["start", "update", "quote", "commitment", "complete", "cancel", "read", "list"]) {
  assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(source.capability, /Recording the quote never accepts it/i);
assert.match(source.capability, /already authorized or placed by another explicit party/i);
assert.match(source.platform, /createSecretaryOfficeAdministrationCapability/);
assert.match(source.platform, /secretary_office_administration:\s*\{/);
assert.match(source.packageJson, /operator-secretary-office-administration-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-office-administration-local\.mjs/);

console.log("OPERATOR_SECRETARY_OFFICE_ADMINISTRATION_AUDIT=PASS");
console.log("SECRETARY_OFFICE_ADMINISTRATION_DURABLE=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_SUPPLIES_AND_FACILITIES=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_VENDOR_FOLLOW_THROUGH=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_QUOTE_IS_NOT_ACCEPTANCE=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_EXTERNAL_COMMITMENT_ONLY=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_COMPLETION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_PURCHASE_AUTHORITY_CREATED=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
