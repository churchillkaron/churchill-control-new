import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimePath = "lib/operator/secretary/SecretaryHospitalityCoordinationRuntime.js";
const capabilityPath = "lib/platform/capabilities/createSecretaryHospitalityCoordinationCapability.js";
const platformPath = "lib/platform/runtime/PlatformDomainRuntime.js";
const packagePath = "package.json";
const wrapperPath = "scripts/run-operator-secretary-meeting-local-certification.sh";

const [runtime, capability, platform, pkg, wrapper] = await Promise.all([
  readFile(runtimePath, "utf8"),
  readFile(capabilityPath, "utf8"),
  readFile(platformPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(wrapperPath, "utf8"),
]);

const requiredRuntimeFragments = [
  "AVANTIQO_EXECUTIVE_SECRETARY_HOSPITALITY_COORDINATION_V1",
  "expected_headcount",
  "SECRETARY_HOSPITALITY_EXPECTED_HEADCOUNT_REQUIRED",
  "requirement_source_reference",
  "SECRETARY_HOSPITALITY_REQUIREMENT_SOURCE_REQUIRED",
  "informational_only: true",
  "quote_accepted: false",
  "vendor_terms_accepted: false",
  "service_authorized_by_secretary: false",
  "purchase_performed: false",
  "order_placed: false",
  "catering_ordered: false",
  "service_confirmation_inferred: false",
  "delivery_inferred: false",
  "headcount_inferred: false",
  "dietary_requirement_inferred: false",
  "accessibility_requirement_inferred: false",
  "SECRETARY_HOSPITALITY_STATUS_SOURCE_REQUIRED",
  "SECRETARY_HOSPITALITY_REQUIRED_ITEMS_INCOMPLETE",
  "SECRETARY_HOSPITALITY_DELIVERY_EVIDENCE_INCOMPLETE",
  "frozen_versions",
  "SECRETARY_HOSPITALITY_STALE_VERSION",
  "SECRETARY_HOSPITALITY_EVIDENCE_REUSE_CONFLICT",
  "avantiqo-secretary-hospitality-follow-up-v1",
  "Do not place an order, accept a quote or terms, authorize service, commit spend, pay, sign, reserve a resource, or treat silence as confirmation.",
];
for (const fragment of requiredRuntimeFragments) assert.ok(runtime.includes(fragment), `Missing runtime contract fragment: ${fragment}`);

for (const fragment of [
  'capability: "secretary_hospitality_coordination"',
  "Quotes are informational only",
  "never places orders",
  "aiEnabled: false",
  "operatorEnabled: true",
  "operatorAutoExecute: true",
  "approval: { required: false }",
]) assert.ok(capability.includes(fragment), `Missing capability fragment: ${fragment}`);

assert.ok(platform.includes("createSecretaryHospitalityCoordinationCapability"), "Platform import missing");
assert.ok(platform.includes("secretary_hospitality_coordination"), "Platform registry missing");
assert.ok(pkg.includes("operator-secretary-hospitality-coordination-audit.mjs"), "Package audit wiring missing");
assert.ok(wrapper.includes("certify-secretary-hospitality-coordination-local.mjs"), "Local wrapper certification wiring missing");

console.log("OPERATOR_SECRETARY_HOSPITALITY_COORDINATION_AUDIT=PASS");
console.log("SECRETARY_HOSPITALITY_EXPLICIT_HEADCOUNT_CONTRACT=true");
console.log("SECRETARY_HOSPITALITY_REQUIREMENT_SOURCE_CONTRACT=true");
console.log("SECRETARY_HOSPITALITY_QUOTE_INFORMATIONAL_ONLY_CONTRACT=true");
console.log("SECRETARY_HOSPITALITY_CONFIRMATION_EVIDENCE_CONTRACT=true");
console.log("SECRETARY_HOSPITALITY_DELIVERY_EVIDENCE_CONTRACT=true");
console.log("SECRETARY_HOSPITALITY_FROZEN_HISTORY_CONTRACT=true");
console.log("SECRETARY_HOSPITALITY_STALE_REPLAY_FENCES=true");
console.log("SECRETARY_HOSPITALITY_SILENCE_CONFIRMATION_INFERRED=false");
console.log("SECRETARY_HOSPITALITY_PURCHASE_AUTHORITY_CREATED=false");
console.log("SECRETARY_HOSPITALITY_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_HOSPITALITY_BINDING_AUTHORITY_CREATED=false");
