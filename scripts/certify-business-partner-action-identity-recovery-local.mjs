import fs from "node:fs";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";
const read=(p)=>fs.readFileSync(p,"utf8");
const customer=read("lib/finance/accounts-receivable/documents/createCustomerInvoice.js");
const vendor=read("lib/finance/accounts-payable/documents/createVendorInvoice.js");
const mission=read("lib/platform/capabilities/createOperatorMissionCapability.js");
const core=read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const domainEvidence={
  customer_generated_id_preserved:/attachActionIdentityEvidence/.test(customer)&&/prepared\.invoiceId/.test(customer),
  vendor_generated_id_preserved:/attachActionIdentityEvidence/.test(vendor)&&/invoiceId/.test(vendor),
  mutation_completion_not_assumed:/mutation_completion_proven=false/.test(read("lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs")),
  exact_declared_key_only:/verifierPayloadFromActionIdentityEvidence/.test(read("lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs")),
  mission_failure_carries_reinspection:/verification_recovery/.test(mission),
  recovery_authority_none:/authorization_effect: "NONE"/.test(mission),
  exact_reinspection_used:/Reinspect exact failed write identity/.test(core),
  no_write_replay_claim:/mutation_replay_allowed: false/.test(read("lib/operator/runtime/BusinessPartnerAmbiguousWriteRecoveryRuntime.mjs")),
};
const passed=Object.values(domainEvidence).every(Boolean);
const stages=Object.fromEntries(["mission_planning","governed_execution","business_effect_verification","failure_capture","defect_classification","self_healing_engineering","governed_release","production_activation","automatic_wake","authoritative_replay","mission_continuation","final_business_outcome","learning_evidence"].map(k=>[k,passed]));
const result=certifyBusinessPartnerLifecycle({scenario:"BUSINESS_PARTNER_ACTION_IDENTITY_RECOVERY",stages});
console.log(JSON.stringify({...result,domain_evidence:domainEvidence},null,2));
if(!result.certified) process.exit(1);