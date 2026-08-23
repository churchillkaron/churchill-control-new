import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const RESEARCH_KEY = "platform.research.search";

const [runtimeSource, capabilitySource, platformSource, bridgeSource] = await Promise.all([
  readFile("lib/platform/research/runtime/OperatorWebResearchRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorWebResearchCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js", "utf8"),
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
  'service_id: "ai.reasoning.execute"',
  'category: "INTELLIGENCE_RESEARCH"',
  'type: "web_search"',
  'include: ["web_search_call.action.sources"]',
  "WEB_RESEARCH_PROVIDER_SEARCH_EVIDENCE_REQUIRED",
  "WEB_RESEARCH_MINIMUM_SOURCES_NOT_MET",
  "source_urls_provider_verified: true",
  "internet_content_untrusted: true",
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

for (const forbidden of [
  "child_process",
  "exec(",
  "spawn(",
  "file://",
  "process.env.OPENAI_API_KEY",
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
console.log("OPERATOR_WEB_RESEARCH_PROVIDER_TRANSPORT=SERVICE_RUNTIME_GOVERNED");
console.log("OPERATOR_WEB_RESEARCH_SOURCE_VALIDATION=PROVIDER_SEARCH_EVIDENCE_REQUIRED");
console.log("OPERATOR_WEB_RESEARCH_EXTERNAL_ACTIONS=BLOCKED");
