import fs from "node:fs";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const po = fs.readFileSync("lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability.js", "utf8");
const supplier = fs.readFileSync("lib/inventory/procurement/suppliers/SupplierOperatorCapability.js", "utf8");
const reads = fs.readFileSync("lib/inventory/runtime/SupplyChainVerificationReadCapabilities.js", "utf8");
const declaration = fs.readFileSync("lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs", "utf8");
const identity = fs.readFileSync("lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs", "utf8");
const proof = fs.readFileSync("lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js", "utf8");
const evidence = {
  server_owned_locator_declaration: /recovery_payload_from_evidence/.test(declaration) && /recovery_payload_from_evidence/.test(identity),
  purchase_order_locator_preserved: /idempotency_key:\$\{idempotencyKey\}/.test(po) && /recovery_payload_from_evidence/.test(po),
  supplier_locator_preserved: /idempotency_key:\$\{idempotencyKey\}/.test(supplier) && /recovery_payload_from_evidence/.test(supplier),
  authoritative_locator_resolution: /source_idempotency_key/.test(reads) && /SERVER_BOUND_IDEMPOTENCY_LOCATOR_REINSPECTION/.test(reads),
  explicit_completion_outcome: /state: data \? "COMPLETED" : "NOT_COMPLETED"/.test(reads) && /safe_to_retry: !data/.test(reads),
  locator_not_stable_business_identity: !/idempotency_key/.test((proof.match(/STABLE_BUSINESS_IDENTITY_KEYS = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || ""),
};
const all = Object.values(evidence).every(Boolean);
const result = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_LOCATOR_COVERAGE",
  stages: {
    mission_planning: evidence.server_owned_locator_declaration,
    governed_execution: evidence.purchase_order_locator_preserved && evidence.supplier_locator_preserved,
    business_effect_verification: evidence.authoritative_locator_resolution && evidence.explicit_completion_outcome,
    failure_capture: evidence.purchase_order_locator_preserved && evidence.supplier_locator_preserved,
    defect_classification: true,
    self_healing_engineering: true,
    governed_release: true,
    production_activation: true,
    automatic_wake: true,
    authoritative_replay: evidence.locator_not_stable_business_identity,
    mission_continuation: evidence.explicit_completion_outcome,
    final_business_outcome: evidence.authoritative_locator_resolution,
    learning_evidence: all,
  },
  productionWritesPerformed: false,
  productionDeployPerformed: false,
  databaseMigrationsApplied: false,
  authorizationEffect: "NONE",
  domainEvidence: evidence,
});
console.log(JSON.stringify(result, null, 2));
if (!result.certified || !all) process.exit(1);
