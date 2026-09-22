import { CANONICAL_OPERATIONS_CAPABILITY_CATALOG } from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";

export function developerCapabilityCatalog() {
  return CANONICAL_OPERATIONS_CAPABILITY_CATALOG.map((capability) => ({
    id: capability.id,
    name: capability.name,
    group: capability.group,
    description: capability.description,
    lifecycle: capability.lifecycle,
    commands: [...(capability.commands || [])],
    events: [...(capability.events || [])],
    readOnly: Boolean(capability.readOnly),
    recordType: capability.recordType || null,
    owner: capability.owner || null,
    consumes: [...(capability.consumes || [])],
    boundary: capability.boundary || null,
    listEndpoint: `/api/operations/${capability.id}`,
    commandEndpoint: `/api/operations/${capability.id}/commands/{command}`,
  }));
}

export default developerCapabilityCatalog;
