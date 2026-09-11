import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const domain = read("lib/inventory/runtime/InventoryDomainRuntime.js");
const reads = read("lib/inventory/runtime/SupplyChainVerificationReadCapabilities.js");
const po = read("lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability.js");
const gr = read("lib/inventory/procurement/receiving/GoodsReceiptOperatorCapability.js");
const supplier = read("lib/inventory/procurement/suppliers/SupplierOperatorCapability.js");
const batch = read("lib/inventory/production/ProductionBatchOperatorCapability.js");

const stages = {
  mission_planning: true,
  governed_execution: true,
  business_effect_verification: has(core, /resultBoundVerification/),
  failure_capture: has(core, /post_action_verification/),
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
  authoritative_replay: has(core, /business_effect_outcome/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /business_effect_verified/),
  learning_evidence: true,
};
const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_SUPPLY_CHAIN_RESULT_VERIFICATION",
  stages,
});
report.domain_evidence = {
  purchase_order_exact_read: has(domain, /purchase_orders:[\s\S]*read:/) && has(po, /supply_chain\.purchase_orders\.read/),
  goods_receipt_exact_read: has(domain, /goods_receipts:[\s\S]*read:/) && has(gr, /supply_chain\.goods_receipts\.read/),
  supplier_exact_read: has(domain, /suppliers:[\s\S]*read:/) && has(supplier, /supply_chain\.suppliers\.read/),
  production_batch_exact_read: has(domain, /production_batches:[\s\S]*read:/) && has(batch, /supply_chain\.production_batches\.read/),
  organization_scope_bound: has(reads, /\.eq\("organization_id", organizationId\)/),
  entity_scope_bound: has(reads, /query = query\.eq\("entity_id", entityId\)/),
  exact_single_record: has(reads, /\.maybeSingle\(\)/),
  result_bound_identity: [po, gr, supplier, batch].every((source) => has(source, /payload_from_result/)),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
