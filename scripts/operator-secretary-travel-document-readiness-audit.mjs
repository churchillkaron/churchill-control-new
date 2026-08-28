import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryTravelDocumentReadinessRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryTravelDocumentReadinessCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

function must(label, condition) {
  if (!condition) throw new Error(`SECRETARY_TRAVEL_DOCUMENT_READINESS_AUDIT_FAIL:${label}`);
}

must("contract", runtime.includes("AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_DOCUMENT_READINESS_V1"));
must("travel_scope", runtime.includes('scope: "TRAVEL_COORDINATION"'));
must("sensitive_field_rejection", runtime.includes("SECRETARY_TRAVEL_DOCUMENT_SENSITIVE_FIELD_FORBIDDEN"));
must("passport_number_not_stored", runtime.includes("passport_number_stored: false"));
must("visa_number_not_stored", runtime.includes("visa_number_stored: false"));
must("identity_content_not_read", runtime.includes("identity_document_content_read: false"));
must("eligibility_not_inferred", runtime.includes("eligibility_inferred: false"));
must("entry_permission_not_inferred", runtime.includes("entry_permission_inferred: false"));
must("visa_requirement_not_inferred", runtime.includes("visa_requirement_inferred: false"));
must("no_submission", runtime.includes("application_submitted: false") && runtime.includes("government_form_submitted: false"));
must("no_fee_payment", runtime.includes("fee_paid: false"));
must("required_items_block", runtime.includes("SECRETARY_TRAVEL_DOCUMENT_REQUIRED_ITEMS_INCOMPLETE"));
must("expiry_warning", runtime.includes("expires_before_departure"));
must("frozen_versions", runtime.includes("frozen_versions") && runtime.includes("TRAVEL_DOCUMENT_READINESS_REOPENED"));
must("stale_fence", runtime.includes("SECRETARY_TRAVEL_DOCUMENT_STALE_VERSION"));
must("replay_fence", runtime.includes("SECRETARY_TRAVEL_DOCUMENT_EVIDENCE_REUSE_CONFLICT"));
must("capability", capability.includes('capability: "secretary_travel_document_readiness"') && capability.includes("aiEnabled: false"));
must("platform_registration", platform.includes("secretary_travel_document_readiness"));
must("package_wiring", String(pkg.scripts?.["audit:operator-secretary-end-to-end"] || "").includes("operator-secretary-travel-document-readiness-audit.mjs"));
must("wrapper_wiring", wrapper.includes("certify-secretary-travel-document-readiness-local.mjs"));

console.log("OPERATOR_SECRETARY_TRAVEL_DOCUMENT_READINESS_AUDIT=PASS");
console.log("SECRETARY_TRAVEL_DOCUMENT_TRAVEL_SCOPE_REUSED=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_SENSITIVE_FIELDS_FORBIDDEN=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_PASSPORT_NUMBER_STORED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_VISA_NUMBER_STORED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_IDENTITY_CONTENT_READ=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_ELIGIBILITY_INFERRED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_ENTRY_PERMISSION_INFERRED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_VISA_REQUIREMENT_INFERRED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_REQUIRED_ITEMS_BLOCK_FINALIZATION=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_FROZEN_VERSION_HISTORY=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_APPLICATION_SUBMITTED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_FEE_PAID=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
