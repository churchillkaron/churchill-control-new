import {
  CANONICAL_OPERATIONS_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";
import {
  createOperationsListCapability,
  operationsUbteCapabilityName,
} from "./capabilities/createOperationsListCapability";
import {
  createOperationsCommandCapability,
} from "./capabilities/createOperationsCommandCapability";

function buildCapabilities() {
  const capabilities = {};

  for (const capability of CANONICAL_OPERATIONS_CAPABILITY_CATALOG) {
    const name = operationsUbteCapabilityName(capability.id);
    const actions = {
      list: async () => createOperationsListCapability(capability),
    };

    if (!capability.readOnly) {
      for (const command of capability.commands) {
        actions[command] = async () =>
          createOperationsCommandCapability(capability, command);
      }
    }

    capabilities[name] = actions;
  }

  return capabilities;
}

export const OperationsDomainRuntime = {
  domain: "operations",
  name: "Operations",
  version: "1.0.0",

  capabilities: buildCapabilities(),
};

export default OperationsDomainRuntime;
