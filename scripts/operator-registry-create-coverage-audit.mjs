import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);
const { operatorRegistryCreateCoverage } = await import(
  "@/lib/platform/registry/OperatorRegistryDomainRuntimes"
);

const [capabilities, coverage] = await Promise.all([
  listOperatorCapabilities(),
  Promise.resolve(operatorRegistryCreateCoverage()),
]);

if (!Array.isArray(coverage)) {
  throw new Error("OPERATOR_REGISTRY_CREATE_COVERAGE: coverage must be an array");
}

const capabilityKeys = new Set(capabilities.map((item) => item.key));
const invalidClassifications = coverage.filter(
  (item) => ![
    "generated_endpoint",
    "delegated_ubte_reference",
    "unavailable",
  ].includes(item.classification),
);
if (invalidClassifications.length) {
  throw new Error(
    `OPERATOR_REGISTRY_CREATE_COVERAGE: invalid classification(s): ${invalidClassifications.map((item) => `${item.domain}.${item.workspace_id}:${item.classification}`).join(",")}`,
  );
}

const generatedMissing = coverage.filter(
  (item) => item.classification === "generated_endpoint" && !capabilityKeys.has(item.capability_key),
);
if (generatedMissing.length) {
  throw new Error(
    `OPERATOR_REGISTRY_CREATE_COVERAGE: generated create capability missing from Operator catalog: ${generatedMissing.map((item) => item.capability_key).join(",")}`,
  );
}

const delegatedMissing = coverage.filter(
  (item) => item.classification === "delegated_ubte_reference" && !capabilityKeys.has(item.capability_key),
);
if (delegatedMissing.length) {
  throw new Error(
    `OPERATOR_REGISTRY_CREATE_COVERAGE: registry delegates to missing Operator capability: ${delegatedMissing.map((item) => item.capability_key).join(",")}`,
  );
}

const unsafeGenerated = coverage.filter(
  (item) =>
    item.classification === "generated_endpoint" &&
    (!item.endpoint || item.endpoint.includes("?") || /\/(list|runtime|report|reports|liquidity|matching|audit-trail|summary|overview|dashboard|search|export)$/i.test(item.endpoint)),
);
if (unsafeGenerated.length) {
  throw new Error(
    `OPERATOR_REGISTRY_CREATE_COVERAGE: unsafe generated create endpoint: ${unsafeGenerated.map((item) => `${item.capability_key}:${item.endpoint}`).join(",")}`,
  );
}

const unavailable = coverage.filter((item) => item.classification === "unavailable");
const counts = coverage.reduce((totals, item) => {
  totals[item.classification] = (totals[item.classification] || 0) + 1;
  return totals;
}, {});

console.log("OPERATOR_REGISTRY_CREATE_COVERAGE_AUDIT=PASS");
console.log(`OPERATOR_REGISTRY_CREATE_TOTAL=${coverage.length}`);
console.log(`OPERATOR_REGISTRY_CREATE_GENERATED_ENDPOINT=${counts.generated_endpoint || 0}`);
console.log(`OPERATOR_REGISTRY_CREATE_DELEGATED_UBTE_REFERENCE=${counts.delegated_ubte_reference || 0}`);
console.log(`OPERATOR_REGISTRY_CREATE_UNAVAILABLE=${unavailable.length}`);
console.log(
  `OPERATOR_REGISTRY_CREATE_UNAVAILABLE_LIST=${unavailable.length ? unavailable.map((item) => `${item.domain}.${item.workspace_id}`).join(",") : "NONE"}`,
);
console.log("OPERATOR_REGISTRY_CREATE_FALSE_EXECUTABILITY=BLOCKED");
