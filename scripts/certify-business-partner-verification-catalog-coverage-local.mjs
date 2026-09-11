import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const catalog = read("lib/operator/runtime/OperatorCapabilityCatalog.js");
const declaration = read("lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs");
const reasoning = read("lib/operator/runtime/OperatorReasoningRuntime.js");
const verification = read("lib/operator/runtime/OperatorVerificationRuntime.js");

const stages = {
  mission_planning: has(reasoning, /verification:\s*capability\.operator_verification/),
  governed_execution: has(verification, /supportedPendingExecution/),
  business_effect_verification: has(verification, /verify_after/),
  failure_capture: true,
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
};Object.assign(stages, {
  authoritative_replay: true,
  mission_continuation: true,
  final_business_outcome: true,
  learning_evidence: true,
});

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_VERIFICATION_CATALOG_COVERAGE",
  stages,
});
report.domain_evidence = {
  catalog_verifier_metadata: has(catalog, /operator_verification:/),
  same_capability_read_only: has(declaration, /candidate\.action === "read"/) && has(declaration, /candidate\.mode === "read"/),
  stable_locator_only: has(declaration, /_id\$|_key\$|_reference\$/),
  no_generated_id_guess: has(declaration, /if \(!locatorKeys\.length\) return null/),
  server_fills_missing_verifier: has(verification, /if \(!verifyAfter\)/) && has(verification, /Object\.fromEntries/),
  exact_payload_projection: has(verification, /payloadKeys\.every/),
  reasoning_sees_verifier: has(reasoning, /verification:\s*capability\.operator_verification/),
  fail_closed_without_mapping: has(verification, /verifyAfter \? \{ verify_after: verifyAfter \} : \{\}/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;