import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry.js";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";

export const OPERATOR_REGISTRY_CREATE_COVERAGE_CONTRACT =
  "AVANTIQO_OPERATOR_REGISTRY_CREATE_COVERAGE_V1";

const NON_COLLECTION_ENDPOINT = /\/(list|runtime|report|reports|liquidity|matching|audit-trail|summary|overview|dashboard|search|export)$/i;

function text(value) {
  return String(value ?? "").trim();
}

function ubteName(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function listEndpoint(item) {
  return text(item?.ui?.api || item?.runtime?.listApi) || null;
}

function collectionCreateEndpoint(item) {
  const endpoint = listEndpoint(item);
  if (!endpoint || NON_COLLECTION_ENDPOINT.test(endpoint) || endpoint.includes("?")) {
    return null;
  }
  return endpoint;
}

function canonicalRegistry() {
  const serialized = serializeCapability(ERP_REGISTRY);
  if (serialized?.workspaces) return serialized;
  return Object.values(serialized || {}).find((value) => value?.workspaces) || {};
}

function delegatedTarget(domain, create = {}) {
  const capability = ubteName(create.capability);
  const action = text(create.action);
  if (!capability || !action || capability === "undefined" || action === "undefined") {
    return null;
  }
  return `${ubteName(domain)}.${capability}.${action}`;
}

export function buildOperatorRegistryCreateCoverage(registry = canonicalRegistry()) {
  const coverage = [];

  for (const [domain, workspace] of Object.entries(registry?.workspaces || {})) {
    for (const group of workspace?.groups || []) {
      for (const item of group?.items || []) {
        if (!item?.id || item?.create?.enabled !== true) continue;

        const declaredEndpoint = text(item.create.api) || null;
        const fallbackEndpoint = collectionCreateEndpoint(item);
        const endpoint = declaredEndpoint || fallbackEndpoint;
        const delegated = delegatedTarget(domain, item.create);
        const generatedKey = `${ubteName(domain)}.${ubteName(item.id)}.create`;

        if (endpoint) {
          coverage.push({
            contract: OPERATOR_REGISTRY_CREATE_COVERAGE_CONTRACT,
            domain: ubteName(domain),
            workspace_id: text(item.id),
            label: text(item.create.label || item.create.title || item.name) || null,
            classification: "generated_endpoint",
            capability_key: generatedKey,
            endpoint,
            endpoint_source: declaredEndpoint ? "create.api" : "safe_collection_fallback",
            delegated_target: delegated,
          });
          continue;
        }

        if (delegated) {
          coverage.push({
            contract: OPERATOR_REGISTRY_CREATE_COVERAGE_CONTRACT,
            domain: ubteName(domain),
            workspace_id: text(item.id),
            label: text(item.create.label || item.create.title || item.name) || null,
            classification: "delegated_ubte_reference",
            capability_key: delegated,
            endpoint: null,
            endpoint_source: null,
            delegated_target: delegated,
          });
          continue;
        }

        coverage.push({
          contract: OPERATOR_REGISTRY_CREATE_COVERAGE_CONTRACT,
          domain: ubteName(domain),
          workspace_id: text(item.id),
          label: text(item.create.label || item.create.title || item.name) || null,
          classification: "unavailable",
          capability_key: null,
          endpoint: null,
          endpoint_source: null,
          delegated_target: null,
        });
      }
    }
  }

  return coverage.sort((left, right) =>
    `${left.domain}.${left.workspace_id}`.localeCompare(`${right.domain}.${right.workspace_id}`),
  );
}

export function operatorRegistryCreateCoverageSummary(coverage = buildOperatorRegistryCreateCoverage()) {
  const totals = {
    generated_endpoint: 0,
    delegated_ubte_reference: 0,
    unavailable: 0,
  };
  for (const item of coverage) {
    if (Object.hasOwn(totals, item.classification)) totals[item.classification] += 1;
  }
  return {
    contract: OPERATOR_REGISTRY_CREATE_COVERAGE_CONTRACT,
    total: coverage.length,
    ...totals,
  };
}

export default buildOperatorRegistryCreateCoverage;
