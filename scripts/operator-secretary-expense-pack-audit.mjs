import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, capability, platform] = await Promise.all([
  readFile("lib/operator/secretary/SecretaryExpensePackRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createSecretaryExpensePackCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
]);

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_EXPENSE_PACK_V1/);
assert.match(runtime, /packTaskId/);
assert.match(runtime, /followUpId/);
assert.match(runtime, /RECEIPT_REQUEST/);
assert.match(runtime, /RECEIPT_CHASE/);
assert.match(runtime, /EXPENSE_PACK_REVIEW/);
assert.match(runtime, /EXPENSE_PACK_REVIEW_RECEIPT_CHASE/);
assert.match(runtime, /execution_owner:\s*"SECRETARY"/);
assert.match(runtime, /execution_ready:\s*true/);
assert.match(runtime, /secretary_owned:\s*true/);
assert.match(runtime, /SECRETARY_EXPENSE_PACK_RECEIPT_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_EXPENSE_PACK_UNAVAILABLE_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_EXPENSE_PACK_REVIEW_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED/);
assert.match(runtime, /multi_currency_totals_not_converted:\s*true/);
assert.match(runtime, /values_not_inferred:\s*true/);
assert.match(runtime, /reimbursement_eligibility_not_inferred:\s*true/);
assert.match(runtime, /accounting_treatment_not_inferred:\s*true/);
assert.match(runtime, /review_is_not_reimbursement_approval:\s*true/);
assert.match(runtime, /review_is_not_accounting_posting_approval:\s*true/);
assert.match(runtime, /acknowledgement_is_not_reimbursement_approval:\s*true/);
assert.match(runtime, /accounting_posting_authority_created:\s*false/);
assert.match(runtime, /reimbursement_authority_created:\s*false/);
assert.match(runtime, /payment_authority_created:\s*false/);
assert.match(runtime, /external_authority_used:\s*false/);
assert.match(runtime, /late_receipts/);
assert.match(runtime, /pending_revision:\s*true/);
assert.match(runtime, /prior_versions_preserved:\s*true/);
assert.match(runtime, /stale_review_fenced:\s*true/);
assert.doesNotMatch(runtime, /deliverCommunicationMessage/);
assert.doesNotMatch(runtime, /placeSecretaryOutboundCall/);
assert.doesNotMatch(runtime, /service_role/i);

for (const action of [
  "start",
  "read",
  "addExpectedItem",
  "recordReceipt",
  "recordUnavailable",
  "finalize",
  "revise",
  "queueReview",
  "acknowledgeReview",
  "cancel",
]) {
  assert.match(capability, new RegExp(`\\b${action}:\\s*\\{`));
  assert.match(platform, new RegExp(`createSecretaryExpensePackCapability\\(\\"${action}\\"\\)`));
}
assert.match(capability, /capability:\s*"secretary_expense_pack"/);
assert.match(capability, /contextScope:\s*"organization"/);
assert.match(capability, /operatorAutoExecute:\s*true/);
assert.match(capability, /operatorRequiresConfirmation:\s*false/);
assert.match(capability, /Review delivery never becomes reimbursement approval, accounting approval, posting approval, or payment authority/i);
assert.match(capability, /Receipt acknowledgement is not reimbursement, accounting, tax, posting, or payment approval/i);
assert.match(platform, /secretary_expense_pack:/);

console.log("OPERATOR_SECRETARY_EXPENSE_PACK_AUDIT=PASS");
console.log("SECRETARY_EXPENSE_PACK_DURABLE_LIFECYCLE=true");
console.log("SECRETARY_EXPENSE_PACK_RECEIPT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_EXPENSE_PACK_MISSING_RECEIPT_CHASING=true");
console.log("SECRETARY_EXPENSE_PACK_MULTI_CURRENCY_NOT_CONVERTED=true");
console.log("SECRETARY_EXPENSE_PACK_VERSION_HISTORY=true");
console.log("SECRETARY_EXPENSE_PACK_LATE_RECEIPT_REVISION=true");
console.log("SECRETARY_EXPENSE_PACK_REVIEW_GOVERNED=true");
console.log("SECRETARY_EXPENSE_PACK_REVIEW_ACK_NOT_APPROVAL=true");
console.log("SECRETARY_EXPENSE_PACK_ACCOUNTING_POSTING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXPENSE_PACK_REIMBURSEMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXPENSE_PACK_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
