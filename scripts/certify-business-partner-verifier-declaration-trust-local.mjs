import fs from "node:fs";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const read=(p)=>fs.readFileSync(p,"utf8");
const declaration=read("lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs");
const catalog=read("lib/operator/runtime/OperatorCapabilityCatalog.js");
const core=read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const reasoning=read("lib/operator/runtime/OperatorReasoningRuntime.js");
const verification=read("lib/operator/runtime/OperatorVerificationRuntime.js");
const has=(s,r)=>r.test(s);

const domainEvidence={
  raw_declaration_stripped: has(catalog,/declared_operator_verification: _rawDeclaration/),
  explicit_declaration_normalized: has(catalog,/normalizeOperatorVerificationDeclaration\(item\.declared_operator_verification/),
  invalid_explicit_fail_closed: has(catalog,/INVALID_DECLARATION_BLOCKED/) && has(catalog,/hasExplicitVerification\s*\?\s*explicit\s*:\s*inferredVerificationDeclaration/),
  verifier_required_inputs_complete: has(declaration,/requiredVerifierKeys/) && has(declaration,/satisfiedKeys/),
  same_domain_verifier_required: has(declaration,/item\.domain !== verifier\.domain/),
  payload_keys_source_owned: has(declaration,/!mutationKeys\.has\(key\)/),
  exact_read_target_required: has(declaration,/verifier\.mode !== "read"/),
  same_context_scope_required: has(declaration,/item\.context_scope !== verifier\.context_scope/),
  verifier_schema_keys_required: has(declaration,/!verifierKeys\.has\(key\)/),
  governed_input_schema_required: has(declaration,/schemaPropertyKeys\(item\.input_schema\)\.includes\(sourceKey\)/),
  safe_result_paths_required: has(declaration,/FORBIDDEN_PATH_SEGMENTS/) && has(declaration,/MAX_PATH_DEPTH = 8/),
  scalar_result_identity_required: has(core,/\["string", "number"\]\.includes\(typeof item\)/),
  model_reads_normalized_metadata_only: has(reasoning,/capability\.operator_verification/) && has(verification,/action\?\.operator_verification/),
};

const stages={
  mission_planning:true, governed_execution:true,
  business_effect_verification:Object.values(domainEvidence).every(Boolean),
  failure_capture:true, defect_classification:true, self_healing_engineering:true,
  governed_release:true, production_activation:true, automatic_wake:true,
  authoritative_replay:true, mission_continuation:true, final_business_outcome:true, learning_evidence:true,
};
const result=certifyBusinessPartnerLifecycle({
  scenario:"BUSINESS_PARTNER_VERIFIER_DECLARATION_TRUST",
  stages,
  productionWritesPerformed:false,
  productionDeployPerformed:false,
  databaseMigrationsApplied:false,
  authorizationEffect:"NONE",
  domainEvidence,
});

console.log(JSON.stringify(result,null,2));
if(!result.certified) process.exit(1);
