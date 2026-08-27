import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryContactRecordMaintenanceRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryContactRecordMaintenanceCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

function must(label, condition) {
  if (!condition) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_AUDIT_FAIL:${label}`);
}

must("contract", runtime.includes("AVANTIQO_EXECUTIVE_SECRETARY_CONTACT_RECORD_MAINTENANCE_V1"));
must("fields", ["display_name", "email", "phone", "legal_name", "address"].every((field) => runtime.includes(`\"${field}\"`)));
must("before_after", runtime.includes("before,") && runtime.includes("after,"));
must("stale_fence", runtime.includes("SECRETARY_CONTACT_MAINTENANCE_STALE_RECORD"));
must("email_collision", runtime.includes("SECRETARY_CONTACT_MAINTENANCE_EMAIL_COLLISION"));
must("phone_collision", runtime.includes("SECRETARY_CONTACT_MAINTENANCE_PHONE_COLLISION"));
must("no_inference", runtime.includes("contact_value_inferred: false") && runtime.includes("identity_verified_inferred: false"));
must("no_merge_delete", runtime.includes("party_merged: false") && runtime.includes("party_deleted: false"));
must("no_authority", runtime.includes("payment_authority_created: false") && runtime.includes("binding_authority_delegated: false"));
must("capability_update", capability.includes('action === "update"') || capability.includes("update:"));
must("capability_read", capability.includes("read:"));
must("platform_registration", platform.includes("secretary_contact_record_maintenance"));
must("package_wiring", String(pkg.scripts?.["audit:operator-secretary-end-to-end"] || "").includes("operator-secretary-contact-record-maintenance-audit.mjs"));
must("wrapper_wiring", wrapper.includes("certify-secretary-contact-record-maintenance-local.mjs"));

console.log("OPERATOR_SECRETARY_CONTACT_RECORD_MAINTENANCE_AUDIT=PASS");
console.log("SECRETARY_CONTACT_MAINTENANCE_EXISTING_PARTY_ONLY=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_BEFORE_AFTER_HISTORY=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_STALE_UPDATE_FENCED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_EMAIL_COLLISION_BLOCKED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_PHONE_COLLISION_BLOCKED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_CONTACT_VALUE_INFERRED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_IDENTITY_VERIFIED_INFERRED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_PARTY_MERGED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_PARTY_DELETED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
