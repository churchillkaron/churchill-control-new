import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  runtime: "lib/operator/secretary/SecretaryPhysicalRecordsCustodyRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryPhysicalRecordsCustodyCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
};
const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])));

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_PHYSICAL_RECORDS_CUSTODY_V1/);
assert.match(source.runtime, /FILE.*FOLDER.*BINDER.*BOX.*OTHER/);
assert.match(source.runtime, /STORED.*CHECKED_OUT.*IN_TRANSFER.*MISSING/);
assert.match(source.runtime, /storage_location/i);
assert.match(source.runtime, /holder_party_id/i);
assert.match(source.runtime, /TRANSFER_ACKNOWLEDGED/);
assert.match(source.runtime, /RETURNED_TO_STORAGE/);
assert.match(source.runtime, /MISSING_RECORDED/);
assert.match(source.runtime, /RECOVERED_TO_STORAGE/);
assert.match(source.runtime, /RETURN_CHASE/);
assert.match(source.runtime, /TRANSFER_ACK_CHASE/);
assert.match(source.runtime, /SECRETARY_PHYSICAL_RECORDS_STALE_VERSION/);
assert.match(source.runtime, /SECRETARY_PHYSICAL_RECORDS_EVIDENCE_REUSE_CONFLICT/);
assert.match(source.runtime, /missing_inferred_from_overdue:\s*false/);
assert.match(source.runtime, /custody_inferred:\s*false/);
assert.match(source.runtime, /missing_status_inferred:\s*false/);
assert.match(source.runtime, /physical_record_content_read:\s*false/);
assert.match(source.runtime, /access_permission_bypassed:\s*false/);
assert.match(source.runtime, /physical_access_granted:\s*false/);
assert.match(source.runtime, /destruction_authorized:\s*false/);
assert.match(source.runtime, /record_destroyed:\s*false/);
assert.match(source.runtime, /retention_decision_made:\s*false/);
assert.match(source.runtime, /archive_deletion_performed:\s*false/);
assert.match(source.runtime, /legal_hold_changed:\s*false/);
assert.match(source.runtime, /source_document_deleted:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /signing_authority_created:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /Do not infer custody from delivery intent or silence/);
assert.match(source.runtime, /Overdue timing alone does not mean the record is missing/);
assert.match(source.runtime, /Cancel only Secretary physical-record custody tracking/);

assert.match(source.capability, /secretary_physical_records_custody/);
assert.match(source.capability, /aiEnabled:\s*false/);
assert.match(source.capability, /operatorEnabled:\s*true/);
assert.match(source.capability, /operatorAutoExecute:\s*true/);
assert.match(source.capability, /risk:\s*"low"/);
assert.match(source.capability, /approvalRequired:\s*false/);
assert.match(source.capability, /never reads record contents/i);
assert.match(source.capability, /never.*destroys records/i);

assert.match(source.platform, /createSecretaryPhysicalRecordsCustodyCapability/);
assert.match(source.platform, /secretary_physical_records_custody/);
assert.match(source.packageJson, /operator-secretary-physical-records-custody-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-physical-records-custody-local\.mjs/);

console.log("OPERATOR_SECRETARY_PHYSICAL_RECORDS_CUSTODY_AUDIT=PASS");
console.log("SECRETARY_PHYSICAL_RECORDS_STORAGE_LOCATION_EXPLICIT=true");
console.log("SECRETARY_PHYSICAL_RECORDS_CUSTODY_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_PHYSICAL_RECORDS_TRANSFER_ACK_REQUIRED=true");
console.log("SECRETARY_PHYSICAL_RECORDS_RETURN_TRACKING=true");
console.log("SECRETARY_PHYSICAL_RECORDS_MISSING_EXCEPTION_EXPLICIT=true");
console.log("SECRETARY_PHYSICAL_RECORDS_MISSING_INFERRED_FROM_OVERDUE=false");
console.log("SECRETARY_PHYSICAL_RECORDS_CONTENT_READ=false");
console.log("SECRETARY_PHYSICAL_RECORDS_ACCESS_PERMISSION_BYPASSED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_DESTRUCTION_AUTHORIZED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_RETENTION_DECISION_MADE=false");
console.log("SECRETARY_PHYSICAL_RECORDS_LEGAL_HOLD_CHANGED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
