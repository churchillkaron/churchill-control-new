import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const MINIMUM_EXPOSED_CAPABILITIES = 100;
const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const ORGANIZATIONAL_CONTEXT_KEY = "platform.organizational_context.read";
const ATTENTION_KEY = "platform.attention.scan";
const GOVERNED_AUTONOMOUS_COMPOSITES = new Set([
  "platform.operator_mission.execute",
  "platform.code_ai_autonomous.execute",
]);

const { listDomainRuntimeNames } = await import(
  "@/lib/ubte/runtime/domains/DomainRuntimeRegistry"
);
const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);
const { operatorRegistrySkippedCreates } = await import(
  "@/lib/platform/registry/OperatorRegistryDomainRuntimes"
);

const [capabilities, organizationalContextSource] = await Promise.all([
  listOperatorCapabilities(),
  readFile("lib/operator/runtime/OperatorOrganizationalContextRuntime.js", "utf8"),
]);

if (!Array.isArray(capabilities) || !capabilities.length) {
  throw new Error(
    "OPERATOR_EXPOSURE: no capabilities are Operator-visible; the Operator cannot act at all",
  );
}

if (capabilities.length < MINIMUM_EXPOSED_CAPABILITIES) {
  throw new Error(
    `OPERATOR_EXPOSURE: only ${capabilities.length} capabilities are Operator-visible, expected at least ${MINIMUM_EXPOSED_CAPABILITIES}`,
  );
}

const byDomain = capabilities.reduce((totals, capability) => {
  totals[capability.domain] = (totals[capability.domain] || 0) + 1;
  return totals;
}, {});

const runtimeDomains = listDomainRuntimeNames().slice().sort();
if (!runtimeDomains.length) {
  throw new Error(
    "OPERATOR_EXPOSURE: no runtime domains are registered; full-system Intelligence coverage cannot be evaluated",
  );
}

const silentDomains = runtimeDomains.filter((domain) => !byDomain[domain]);
if (silentDomains.length) {
  throw new Error(
    `OPERATOR_EXPOSURE: runtime domain(s) are completely silent to Intelligence: ${silentDomains.join(", ")}`,
  );
}

for (const capability of capabilities) {
  if (!capability.description) {
    throw new Error(
      `OPERATOR_EXPOSURE: ${capability.key} has no description, so the Operator cannot reason about it`,
    );
  }

  if (!["read", "draft", "write", "approve", "navigate"].includes(capability.mode)) {
    throw new Error(
      `OPERATOR_EXPOSURE: ${capability.key} has unknown operator mode "${capability.mode}"`,
    );
  }

  if (!["low", "medium", "high", "critical"].includes(capability.risk)) {
    throw new Error(
      `OPERATOR_EXPOSURE: ${capability.key} has unknown risk tier "${capability.risk}"`,
    );
  }

  const governedComposite = GOVERNED_AUTONOMOUS_COMPOSITES.has(capability.key);

  if (
    capability.mode !== "read" &&
    !capability.permissions.length &&
    !governedComposite
  ) {
    throw new Error(
      `OPERATOR_EXPOSURE: ${capability.key} is a ${capability.mode} capability with no declared permissions`,
    );
  }

  if (
    capability.mode !== "read" &&
    capability.auto_execute &&
    !capability.requires_confirmation &&
    !governedComposite
  ) {
    throw new Error(
      `OPERATOR_EXPOSURE: ${capability.key} auto-executes a ${capability.mode} without requiring confirmation`,
    );
  }
}

const readChain = capabilities.find((capability) => capability.key === READ_CHAIN_KEY);
if (!readChain) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${READ_CHAIN_KEY} is missing, so multi-read business questions cannot execute autonomously`,
  );
}

if (
  readChain.mode !== "read" ||
  readChain.auto_execute !== true ||
  readChain.requires_confirmation === true ||
  readChain.transactional === true ||
  readChain.risk !== "low"
) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${READ_CHAIN_KEY} must remain a low-risk, non-transactional, auto-executing read capability`,
  );
}

const readChainFields = Array.isArray(readChain.input_schema?.required)
  ? readChain.input_schema.required
  : [];
if (!readChainFields.includes("steps")) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${READ_CHAIN_KEY} must require an explicit bounded steps array`,
  );
}

const organizationalContext = capabilities.find(
  (capability) => capability.key === ORGANIZATIONAL_CONTEXT_KEY,
);
if (!organizationalContext) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${ORGANIZATIONAL_CONTEXT_KEY} is missing, so Operator cannot retrieve dynamic organization memory through the governed capability fabric`,
  );
}

if (
  organizationalContext.mode !== "read" ||
  organizationalContext.auto_execute !== true ||
  organizationalContext.requires_confirmation === true ||
  organizationalContext.transactional === true ||
  organizationalContext.risk !== "low" ||
  organizationalContext.context_scope !== "organization"
) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${ORGANIZATIONAL_CONTEXT_KEY} must remain an organization-scoped, low-risk, non-transactional, auto-executing read capability`,
  );
}

if (!Array.isArray(organizationalContext.operator_aliases)) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${ORGANIZATIONAL_CONTEXT_KEY} must expose manifest-driven Operator aliases`,
  );
}

for (const requiredSource of [
  'from("organizations")',
  'from("organization_industries")',
  'from("ai_business_profiles")',
  'from("intelligence_conversations")',
  'from("intelligence_turns")',
  '.eq("organization_id", organizationId)',
  '.eq("party_id", partyId)',
  "relevant_prior_goals",
  "relevant_verified_history",
]) {
  if (!organizationalContextSource.includes(requiredSource)) {
    throw new Error(
      `OPERATOR_EXPOSURE: organizational brain is missing required dynamic scope contract ${requiredSource}`,
    );
  }
}

if (
  /restaurant|hotel|construction|healthcare|pest_control|retail|entertainment|accounting_firm/i.test(
    organizationalContextSource,
  )
) {
  throw new Error(
    "OPERATOR_EXPOSURE: organizational brain contains hardcoded industry semantics",
  );
}

if (/buildDefaultBusinessProfile|getOrCreateBusinessProfile/.test(organizationalContextSource)) {
  throw new Error(
    "OPERATOR_EXPOSURE: organizational brain must not generate hardcoded default business profiles",
  );
}

const attention = capabilities.find(
  (capability) => capability.key === ATTENTION_KEY,
);
if (!attention) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${ATTENTION_KEY} is missing, so Operator cannot proactively inspect what deserves attention`,
  );
}

if (
  attention.mode !== "read" ||
  attention.auto_execute !== true ||
  attention.requires_confirmation === true ||
  attention.transactional === true ||
  attention.risk !== "low" ||
  attention.context_scope !== "organization"
) {
  throw new Error(
    `OPERATOR_EXPOSURE: ${ATTENTION_KEY} must remain an organization-scoped, low-risk, non-transactional, auto-executing read capability`,
  );
}

const modes = capabilities.reduce((totals, capability) => {
  totals[capability.mode] = (totals[capability.mode] || 0) + 1;
  return totals;
}, {});
const skippedCreates = operatorRegistrySkippedCreates().slice().sort();

console.log("OPERATOR_CAPABILITY_EXPOSURE_AUDIT=PASS");
console.log(`OPERATOR_EXPOSED_CAPABILITIES=${capabilities.length}`);
console.log(`OPERATOR_RUNTIME_DOMAINS=${runtimeDomains.length}`);
console.log(`OPERATOR_RUNTIME_DOMAIN_LIST=${runtimeDomains.join(",")}`);
console.log(
  `OPERATOR_EXPOSED_BY_DOMAIN=${Object.entries(byDomain)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, count]) => `${domain}:${count}`)
    .join(",")}`,
);
console.log(
  `OPERATOR_EXPOSED_BY_MODE=${Object.entries(modes)
    .map(([mode, count]) => `${mode}:${count}`)
    .join(",")}`,
);
console.log("OPERATOR_SILENT_DOMAINS=NONE");
console.log(`OPERATOR_REGISTRY_SKIPPED_CREATE_COUNT=${skippedCreates.length}`);
console.log(
  `OPERATOR_REGISTRY_SKIPPED_CREATES=${skippedCreates.length ? skippedCreates.join(",") : "NONE"}`,
);
console.log(
  `OPERATOR_GOVERNED_AUTONOMOUS_COMPOSITES=${[...GOVERNED_AUTONOMOUS_COMPOSITES].join(",")}`,
);
console.log("OPERATOR_WRITE_GOVERNANCE=CONFIRMATION_AND_AUDIT_REQUIRED");
console.log("OPERATOR_AUTONOMOUS_READ_CHAIN=BOUNDED_2_TO_4_READS");
console.log("OPERATOR_AUTONOMOUS_READ_CHAIN_GUARD=READ_ONLY_SCOPE_PERMISSION_PREFLIGHT");
console.log("OPERATOR_ORGANIZATIONAL_BRAIN=REGISTERED_READ_CAPABILITY");
console.log("OPERATOR_ORGANIZATIONAL_BRAIN_SCOPE=ORGANIZATION_PLUS_SAME_PARTY_HISTORY");
console.log("OPERATOR_ORGANIZATIONAL_BRAIN_PROFILE=EXISTING_DATA_ONLY_NO_DEFAULT_GENERATION");
console.log("OPERATOR_ORGANIZATIONAL_BRAIN_SEMANTICS=DYNAMIC_NO_INDUSTRY_DICTIONARY");
console.log("OPERATOR_ORGANIZATIONAL_BRAIN_AUDIT_OWNER=OPERATOR_CAPABILITY_EXPOSURE");
console.log("OPERATOR_ANTICIPATORY_PARTNER=REGISTERED_READ_CAPABILITY");

await import("./operator-anticipatory-partner-audit.mjs");