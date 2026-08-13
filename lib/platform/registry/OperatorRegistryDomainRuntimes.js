import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry.base.js";
import {
  buildOperatorRegistryCapabilities,
} from "@/lib/platform/registry/operatorRegistryBridge";

// Built once per process. The bridge derives one runtime per registry workspace so
// every domain the UI exposes is reachable by the Operator, instead of only the
// domains that happen to have a hand written UBTE runtime.
let cache = null;

function state() {
  if (!cache) {
    const registry =
      ERP_REGISTRY?.workspaces
        ? ERP_REGISTRY
        : Object.values(ERP_REGISTRY || {}).find((value) => value?.workspaces) || {};

    cache = buildOperatorRegistryCapabilities(registry);
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
