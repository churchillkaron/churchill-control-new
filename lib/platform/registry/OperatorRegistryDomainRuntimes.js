import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry.js";
import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";
import {
  buildOperatorRegistryCapabilities,
} from "@/lib/platform/registry/operatorRegistryBridge";
import {
  buildOperatorRegistryCreateCoverage,
} from "@/lib/platform/registry/OperatorRegistryCreateCoverage";

// Built once per process. Operator capability discovery must use the same
// converged registry contract as the platform UI/API, including domain-owned
// runtime normalization. Using the raw base registry here can expose stale
// endpoints, status and context scope after a domain converges its workspace.
let cache = null;

function state() {
  if (!cache) {
    const canonicalRegistry = serializeCapability(ERP_REGISTRY);
    const registry =
      canonicalRegistry?.workspaces
        ? canonicalRegistry
        : Object.values(canonicalRegistry || {}).find((value) => value?.workspaces) || {};

    cache = {
      ...buildOperatorRegistryCapabilities(registry),
      createCoverage: buildOperatorRegistryCreateCoverage(registry),
    };
  }
  return cache;
}

export function operatorRegistryDomains() {
  return Object.keys(state().capabilities);
}

export function operatorRegistryDomainRuntime(domain) {
  const capabilities = state().capabilities[domain];
  if (!capabilities) return null;

  return {
    domain,
    name: domain,
    version: "1.0.0",
    capabilities,
  };
}

export function operatorRegistrySkippedCreates() {
  return [...state().skippedCreates];
}

export function operatorRegistryCreateCoverage() {
  return state().createCoverage.map((item) => ({ ...item }));
}

// Domain runtimes keyed for DomainRuntimeRegistry. A domain already backed by a
// hand written runtime keeps that runtime; the bridge only fills the gaps.
export function operatorRegistryDomainLoaders({ reserved = [] } = {}) {
  const loaders = {};
  const skip = new Set(reserved);

  for (const domain of operatorRegistryDomains()) {
    if (skip.has(domain)) continue;
    loaders[domain] = async () => operatorRegistryDomainRuntime(domain);
  }

  return loaders;
}

export default operatorRegistryDomainLoaders;
