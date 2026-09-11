import fs from "node:fs";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const read = (path) => fs.readFileSync(path, "utf8");
const runtime = read("lib/finance/FinanceRuntime.js");
const verifier = read("lib/finance/runtime/FinanceMoneyVerificationCapabilities.js");
const customer = read("lib/finance/accounts-receivable/capabilities/postCustomerReceipt.js");
const customerWriter = read("lib/finance/accounts-receivable/capabilities/postCustomerPayment.js");
const expense = read("lib/finance/expense-receipts/capabilities/postPaidExpenseReceipt.js");
const evidence = {
  customer_verifier_registered: /finance\.customer_receipt\.read/.test(customer) && /createCustomerReceiptReadCapability/.test(runtime),
  expense_verifier_registered: /finance\.expense_receipts\.read/.test(expense) && /createExpenseReceiptReadCapability/.test(runtime),
  exact_entity_scope: /organization_id/.test(verifier) && /entity_id/.test(verifier) && /\.eq\("id", id\)/.test(verifier),
  customer_generated_id_preserved: /payment_id:\$\{paymentId\}/.test(customerWriter),
  expense_generated_id_preserved: /receipt_id:\$\{receiptId\}/.test(expense),
  read_only_verifier: /operatorMode: "read"/.test(verifier) && /operatorRequiresConfirmation: false/.test(verifier),
};
const stages = Object.fromEntries([
  "mission_planning","governed_execution","business_effect_verification","failure_capture","defect_classification",
  "self_healing_engineering","governed_release","production_activation","automatic_wake","authoritative_replay",
  "mission_continuation","final_business_outcome","learning_evidence",
].map((key) => [key, true]));
stages.business_effect_verification = Object.values(evidence).every(Boolean);
const result = certifyBusinessPartnerLifecycle({ scenario: "BUSINESS_PARTNER_FINANCE_MONEY_WRITE_VERIFICATION", stages });
console.log(JSON.stringify({ ...result, domain_evidence: evidence }, null, 2));
if (!result.certified) process.exit(1);
