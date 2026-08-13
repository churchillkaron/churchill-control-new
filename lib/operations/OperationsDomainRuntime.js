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

// Generated capabilities are pure functions of their catalogue entry, but the
// Operator catalogue invokes every loader whenever its cache expires. Rebuilding
// 790+ manifests, each with a derived schema and a deep freeze, cost ~820ms per
// rebuild. Memoising per action makes every rebuild after the first free for the
// life of the process.
function memoize(factory) {
  let value;
  let built = false;

  return async () => {
    if (!built) {
      value = factory();
      built = true;
    }
    return value;
  };
}

function buildCapabilities() {
  const capabilities = {};

  for (const capability of CANONICAL_OPERATIONS_CAPABILITY_CATALOG) {
    const name = operationsUbteCapabilityName(capability.id);
    const actions = {
      list: memoize(() => createOperationsListCapability(capability)),
    };

    if (!capability.readOnly) {
      for (const command of capability.commands) {
        actions[command] = memoize(() =>
          createOperationsCommandCapability(capability, command),
        );
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
