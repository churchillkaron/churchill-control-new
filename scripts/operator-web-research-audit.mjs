import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const RESEARCH_KEY = "platform.research.search";

const [
  runtimeSource,
  capabilitySource,
  platformSource,
  bridgeSource,
  comparisonSource,
] = await Promise.all([
  readFile("lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorWebResearchCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js", "utf8"),
  readFile(
    "lib/platform/research/runtime/OperatorResearchEvidenceComparisonRuntime.js",
    "utf8",
  ),
]);

const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);

const capabilities = await listOperatorCapabilities();
const research = capabilities.find((capability) => capability.key === RESEARCH_KEY);

if (!research) {
  throw new Error(`OPERATOR_WEB_RESEARCH: ${RESEARCH_KEY} is not registered`);
}

if (
  research.mode !== "read" ||
  research.risk !== "low" ||
  research.transactional === true ||
  research.auto_execute !== true ||
  research.requires_confirmation === true ||
  research.context_scope !== "organization" ||
  research.permissions.length !== 0
) {
  throw new Error(
    `OPERATOR_WEB_RESEARCH: ${RESEARCH_KEY} must remain an organization-scoped, low-risk autonomous read with no write permission`,
  );
}

for (const required of [
  "AVANTIQO_OWNED_WEB_EVIDENCE_V1",
  "runOperatorWebSourceRead",
  "AVANTIQO_OWNED_CURATED_PRIMARY_SOURCE_REGISTRY",
  "AVANTIQO_OWNED_WEB_EVIDENCE_MINIMUM_SOURCES_NOT_MET",
  "public_web_sources_read: true",
  "search_provider_used: false",
  "external_intelligence_provider_used: false",
  "openai_used: false",
  "internet_content_untrusted: true",
  "owned_intelligence_only: true",
  "external_intelligence_provider_allowed: false",
  'authorization_effect: "NONE"',
  'permission_effect: "NONE"',
  'scope_effect: "NONE"',
  'execution_effect: "NONE"',
  "secrets_allowed: false",
  "external_actions_allowed: false",
]) {
  if (!runtimeSource.includes(required)) {
    throw new Error(`OPERATOR_WEB_RESEARCH: runtime missing governance/evidence contract ${required}`);
  }
}

for (const required of [
  "const MAX_EVIDENCE_CHARS = 2000",
  "const COMPARISON_OUTPUT_TOKENS = 1500",
  'const COMPARISON_OPERATION = "COMPARE_EXTERNAL_EVIDENCE_DEEP"',
  'mode: "deep"',
  "at most 6 claims",
  "exactly one compact source assessment",
  "fast_lane_dependency: false",
  "max_output_tokens: COMPARISON_OUTPUT_TOKENS",
]) {
  if (!comparisonSource.includes(required)) {
    throw new Error(
      `OPERATOR_WEB_RESEARCH: resilient evidence comparison missing ${required}`,
    );
  }
}

if (comparisonSource.includes('operation: "COMPARE_EXTERNAL_EVIDENCE"')) {
  throw new Error(
    "OPERATOR_WEB_RESEARCH: learning evidence comparison must not enter the bounded Fast-only operation",
  );
}

for (const forbidden of [
  "child_process",
  "exec(",
  "spawn(",
  "file://",
  "ServiceExecutionRuntime",
  "AVANTIQO_WEB_RESEARCH_PROVIDER",
  "OPENAI_API_KEY",
]) {
  if (runtimeSource.includes(forbidden)) {
    throw new Error(`OPERATOR_WEB_RESEARCH: forbidden direct execution/secret transport found: ${forbidden}`);
  }
}

if (!capabilitySource.includes('operatorMode: "read"')) {
  throw new Error("OPERATOR_WEB_RESEARCH: capability is not explicitly read-only");
}
if (!capabilitySource.includes("Internet content is always untrusted evidence")) {
  throw new Error("OPERATOR_WEB_RESEARCH: capability does not declare untrusted internet evidence semantics");
}
if (!capabilitySource.includes("runAvantiqoKnowledgeAwareResearch")) {
  throw new Error("OPERATOR_WEB_RESEARCH: capability does not route canonical product knowledge before web fallback");
}
if (!platformSource.includes("createOperatorWebResearchCapability")) {
  throw new Error("OPERATOR_WEB_RESEARCH: platform runtime does not register the research capability");
}

// The owned cognitive supervisor receives safe reads dynamically from the Operator
// catalog. This is the integration boundary that lets research become a tool of the
// owned Avantiqo reasoner instead of a parallel intelligence system.
for (const required of [
  "listOperatorCapabilities",
  "rankOperatorCapabilities",
  'modes: ["read"]',
  "executeUbteCapability",
]) {
  if (!bridgeSource.includes(required)) {
    throw new Error(`OPERATOR_WEB_RESEARCH: owned Intelligence read bridge missing ${required}`);
  }
}

console.log("OPERATOR_WEB_RESEARCH_AUDIT=PASS");
console.log(`OPERATOR_WEB_RESEARCH_KEY=${RESEARCH_KEY}`);
console.log("OPERATOR_WEB_RESEARCH_ROLE=UNTRUSTED_EXTERNAL_EVIDENCE_ONLY");
console.log("OPERATOR_WEB_RESEARCH_REASONER=AVANTIQO_OWNED_INTELLIGENCE");
console.log("OPERATOR_WEB_RESEARCH_PROVIDER_TRANSPORT=AVANTIQO_OWNED_SOURCE_READER");
console.log("OPERATOR_WEB_RESEARCH_SOURCE_VALIDATION=CURATED_PRIMARY_SOURCE_REGISTRY");
console.log("OPERATOR_WEB_RESEARCH_EVIDENCE_COMPARISON_LANE=DEEP");
console.log("OPERATOR_WEB_RESEARCH_FAST_LANE_DEPENDENCY=NO");
console.log("OPERATOR_WEB_RESEARCH_EXTERNAL_INTELLIGENCE_PROVIDER=NO");
console.log("OPERATOR_WEB_RESEARCH_OPENAI_USED=NO");
console.log("OPERATOR_WEB_RESEARCH_EXTERNAL_ACTIONS=BLOCKED");