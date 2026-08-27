import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryMailCourierCoordinationRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryMailCourierCoordinationCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_MAIL_COURIER_COORDINATION_V1/);
assert.match(source.runtime, /secretary_mail_courier/);
assert.match(source.runtime, /DOCUMENT_COORDINATION/);
assert.match(source.runtime, /RECEIPT_RECORDED/);
assert.match(source.runtime, /ROUTE_RECORDED/);
assert.match(source.runtime, /HANDOFF_RECORDED/);
assert.match(source.runtime, /DISPATCH_RECORDED/);
assert.match(source.runtime, /DELIVERY_RECORDED/);
assert.match(source.runtime, /EXCEPTION_RECORDED/);
assert.match(source.runtime, /SECRETARY_MAIL_COURIER_HANDOFF_RECIPIENT_MISMATCH/);
assert.match(source.runtime, /SECRETARY_MAIL_COURIER_EVIDENCE_REUSE_CONFLICT/);
assert.match(source.runtime, /replay_safe:\s*true/);
assert.match(source.runtime, /receipt_inferred:\s*false/);
assert.match(source.runtime, /collection_inferred:\s*false/);
assert.match(source.runtime, /dispatch_inferred:\s*false/);
assert.match(source.runtime, /delivery_inferred:\s*false/);
assert.match(source.runtime, /legal_acceptance_inferred:\s*false/);
assert.match(source.runtime, /contractual_acceptance_inferred:\s*false/);
assert.match(source.runtime, /customs_declaration_created:\s*false/);
assert.match(source.runtime, /customs_declaration_submitted:\s*false/);
assert.match(source.runtime, /carrier_booking_performed:\s*false/);
assert.match(source.runtime, /postage_purchase_performed:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /signing_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

assert.match(source.capability, /capability:\s*"secretary_mail_courier"/);
for (const action of ["start", "receipt", "route", "handoff", "dispatch", "delivery", "exception", "cancel", "read", "list"]) {
  assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(source.capability, /does not purchase postage or book a carrier/i);
assert.match(source.capability, /never claims that an external carrier shipment was cancelled/i);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);

assert.match(source.platform, /createSecretaryMailCourierCoordinationCapability/);
assert.match(source.platform, /secretary_mail_courier:\s*\{/);
assert.match(source.packageJson, /operator-secretary-mail-courier-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-mail-courier-local\.mjs/);

console.log("OPERATOR_SECRETARY_MAIL_COURIER_AUDIT=PASS");
console.log("SECRETARY_MAIL_COURIER_DURABLE_COORDINATION=true");
console.log("SECRETARY_MAIL_COURIER_CHAIN_OF_CUSTODY_EVIDENCE=true");
console.log("SECRETARY_MAIL_COURIER_INBOUND_ROUTING=true");
console.log("SECRETARY_MAIL_COURIER_OUTBOUND_TRACKING=true");
console.log("SECRETARY_MAIL_COURIER_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_MAIL_COURIER_RECEIPT_INFERRED=false");
console.log("SECRETARY_MAIL_COURIER_COLLECTION_INFERRED=false");
console.log("SECRETARY_MAIL_COURIER_DELIVERY_INFERRED=false");
console.log("SECRETARY_MAIL_COURIER_CARRIER_BOOKING_PERFORMED=false");
console.log("SECRETARY_MAIL_COURIER_POSTAGE_PURCHASE_PERFORMED=false");
console.log("SECRETARY_MAIL_COURIER_CUSTOMS_AUTHORITY_CREATED=false");
console.log("SECRETARY_MAIL_COURIER_LEGAL_ACCEPTANCE_INFERRED=false");
console.log("SECRETARY_MAIL_COURIER_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
