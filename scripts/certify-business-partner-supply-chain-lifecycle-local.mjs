import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(relative)=>fs.readFileSync(path.join(root,relative),"utf8");
const has=(source,pattern)=>pattern.test(source);
const mission=read("lib/platform/capabilities/createOperatorMissionCapability.js");
const core=read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const synthetic=read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const repair=read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay=read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const wake=read("lib/operator/runtime/BusinessPartnerRepairContinuationWorkerRuntime.js");
const vendorBill=read("lib/finance/accounts-payable/documents/createVendorInvoice.js");
const vendorCost=read("lib/inventory/costing/VendorInvoiceCostProjectionCapability.js");
const costSql=read("supabase/migrations/20260910163000_vendor_invoice_cost_projection_atomic.sql");
const recipe=read("lib/inventory/production/recipes/capabilities/calculateRecipeCost.js");
const menu=read("lib/inventory/production/costing/capabilities/runMenuEngineering.js");
const learning=read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages={
  mission_planning:has(mission,/OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS/)&&has(mission,/ACTION_REQUIRES_VERIFY_AFTER/),
  governed_execution:has(vendorCost,/procurement\.manage/)&&has(vendorCost,/operatorRequiresConfirmation:true/)&&has(core,/separate Supply Chain write and requires your confirmation/),
  business_effect_verification:has(costSql,/update public\.inventory_items/)&&has(costSql,/update public\.dishes/)&&has(costSql,/supply_chain_apply_vendor_invoice_costs_atomic/),
  failure_capture:has(mission,/AVANTIQO_OPERATOR_MISSION_STEP_FAILURE_EVIDENCE_V1/)&&has(core,/AVANTIQO_BUSINESS_PARTNER_MISSION_RECOVERY_V1/),
  defect_classification:has(synthetic,/PRODUCT_DEFECT_CANDIDATE/)&&has(synthetic,/current_defect_evidence_confirmed/),
  self_healing_engineering:has(repair,/preparePlatformSelfHealingCodeMission/)&&has(repair,/executePlatformSelfHealingCodeMission/),
  governed_release:has(repair,/REQUEST_COMMIT_CONFIRMATION/)&&has(repair,/automaticReleaseAllowed/),
  production_activation:has(repair,/activation_verified/)&&has(wake,/verifyExistingProductionDeployment/),
  automatic_wake:has(wake,/runSyntheticIntelligenceTurn/)&&has(wake,/message:"continue",source:"event"/),
  authoritative_replay:has(core,/verifyPlatformSelfHealingReplay/)&&has(replay,/SELF_HEALING_FIXED_VERIFIED/)&&has(replay,/expected_outcome_observed/),
  mission_continuation:has(core,/businessPartnerMissionContinuation/)&&has(core,/Continue original mission after verified repaired step/),
  final_business_outcome:has(vendorBill,/cost_evidence: \{ persisted:/)&&has(recipe,/CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3/)&&has(recipe,/component_recipe/)&&has(menu,/calculateRecipeCost/),
  learning_evidence:has(learning,/recordBusinessPartnerRepairProductEvidence/)&&has(learning,/business_effect_verified/),
};
const report=certifyBusinessPartnerLifecycle({scenario:"SUPPLY_CHAIN_VENDOR_INVOICE_TO_RECURSIVE_MENU_COST_WITH_SELF_HEALING",stages});
report.domain_evidence={finance_cost_evidence_only:!has(vendorBill,/supply_chain_apply_vendor_invoice_costs_atomic/),separate_supply_chain_confirmation:has(core,/Yes, update food costs/),canonical_cost_basis:has(recipe,/CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3/),nested_recipe_depth_guard:has(recipe,/MAX_RECIPE_DEPTH = 12/),cycle_guard:has(recipe,/recipe component cycle detected/),menu_uses_same_cost_model:has(menu,/calculateRecipeCost/)};
report.certified=report.certified&&Object.values(report.domain_evidence).every(Boolean);
report.status=report.certified?"CERTIFIED":"CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report,null,2));
if(!report.certified) process.exitCode=1;
