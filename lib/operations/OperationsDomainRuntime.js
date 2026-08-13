import {
  CANONICAL_OPERATIONS_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";
import {
  createOperationsListCapability,
  operationsUbteCapabilityName,
} from "./capabilities/createOperationsListCapability";

function buildCapabilities() {
  const capabilities = {};

  for (const capability of CANONICAL_OPERATIONS_CAPABILITY_CATALOG) {
    const name = operationsUbteCapabilityName(capability.id);

    capabilities[name] = {
      ...(capabilities[name] || {}),
      list: async () => createOperationsListCapability(capability),
    };
  }

  capabilities.work_items = {
    ...(capabilities.work_items || {}),
    createWorkItem: () => import("./capabilities/createWorkItem"),
  };

  return capabilities;
}

export const OperationsDomainRuntime = {
  domain: "operations",
  name: "Operations",
  version: "1.0.0",

  capabilities: buildCapabilities(),
};

export default OperationsDomainRuntime;
