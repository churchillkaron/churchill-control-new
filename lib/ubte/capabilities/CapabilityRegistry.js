import { CapabilityRegistry } from "@/lib/capability-registry";

export function getCapabilityDefinition(capabilityId) {
  return CapabilityRegistry.get(capabilityId);
}

export function listCapabilityDefinitions() {
  return CapabilityRegistry.all();
}

export { CapabilityRegistry };
