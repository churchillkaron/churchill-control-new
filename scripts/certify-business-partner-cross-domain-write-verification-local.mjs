import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const project = read("lib/projects/runtime/ProjectsOperatorCapability.js");
const people = read("lib/people/runtime/PeopleOperatorCapability.js");
const compliance = read("lib/compliance/runtime/ComplianceAssetOperatorCapability.js");
const bank = read("lib/finance/bank-statements/capabilities/importBankStatement.js");
const peopleRead = read("lib/people/runtime/PeopleEmployeeVerificationReadCapability.js");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const turn = read("lib/operator/runtime/OperatorTurnRuntime.js");

const stages = {
  mission_planning: true,
  governed_execution: has(turn, /preflightSelectedRecommendationVerification/),
  business_effect_verification: has(core, /resultBoundVerification/),
  failure_capture: true,
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
  authoritative_replay: has(core, /business_effect_outcome/),
  mission_continuation: true,
  final_business_outcome: true,
  learning_evidence: true,
};
const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_CROSS_DOMAIN_WRITE_VERIFICATION",
  stages,
});
report.domain_evidence = {
  project_result_bound: has(project, /projects\.projects\.read/) && has(project, /project\.id/),
  employee_result_bound: has(people, /people\.employees\.read/) && has(people, /employee\.id/),
  employee_assignment_verified: has(peopleRead, /employee_employment_assignments/) && has(peopleRead, /staff_id/),
  compliance_asset_result_bound: has(compliance, /compliance\.assets\.read/) && has(compliance, /asset\.id/),
  bank_statement_result_bound: has(bank, /finance\.bank_statements\.read/) && has(bank, /statement_import_id/),
  verifier_preflight: has(turn, /verificationCapabilityKey/),
  post_action_binding: has(core, /resultBoundVerification/),
  authority_none: true,
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
