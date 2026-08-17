import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const MINIMUM_EXPOSED_CAPABILITIES = 100;
const MINIMUM_EXPOSED_DOMAINS = 2;
const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const GOVERNED_AUTONOMOUS_COMPOSITES = new Set([
  "platform.operator_mission.execute",
]);

const { DOMAIN_RUNTIMES } = await import(
  "@/lib/ubte/runtime/domains/DomainRuntimeRegistry"
);
const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);

const capabilities = await listOperatorCapabilities();

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

if (Object.keys(byDomain).length < MINIMUM_EXPOSED_DOMAINS) {
  throw new Error(
    `OPERATOR_EXPOSURE: only ${Object.keys(byDomain).length} domain(s) expose capabilities, expected at least ${MINIMUM_EXPOSED_DOMAINS}`,
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

const registeredDomains = Object.keys(DOMAIN_RUNTIMES || {});
const silentDomains = registeredDomains.filter((domain) => !byDomain[domain]);

const modes = capabilities.reduce((totals, capability) => {
  totals[capability.mode] = (totals[capability.mode] || 0) + 1;
  return totals;
}, {});

console.log("OPERATOR_CAPABILITY_EXPOSURE_AUDIT=PASS");
console.log(`OPERATOR_EXPOSED_CAPABILITIES=${capabilities.length}`);
console.log(`OPERATOR_REGISTERED_DOMAINS=${registeredDomains.length}`);
console.log(
  `OPERATOR_EXPOSED_BY_DOMAIN=${Object.entries(byDomain)
    .map(([domain, count]) => `${domain}:${count}`)
    .join(",")}`,
);
console.log(
  `OPERATOR_EXPOSED_BY_MODE=${Object.entries(modes)
    .map(([mode, count]) => `${mode}:${count}`)
    .join(",")}`,
);
console.log(
  `OPERATOR_SILENT_DOMAINS=${silentDomains.length ? silentDomains.join(",") : "NONE"}`,
);
console.log(
  `OPERATOR_GOVERNED_AUTONOMOUS_COMPOSITES=${[...GOVERNED_AUTONOMOUS_COMPOSITES].join(",")}`,
);
console.log("OPERATOR_WRITE_GOVERNANCE=CONFIRMATION_AND_AUDIT_REQUIRED");
console.log("OPERATOR_AUTONOMOUS_READ_CHAIN=BOUNDED_2_TO_4_READS");
console.log("OPERATOR_AUTONOMOUS_READ_CHAIN_GUARD=READ_ONLY_SCOPE_PERMISSION_PREFLIGHT");
