import { getCapabilityDefinition } from "./CapabilityRegistry";

export async function executeCapability({
  capabilityId,
  context,
  payload = {},
  executor,
}) {
  if (!capabilityId) {
    throw new Error("UBTE: capabilityId required");
  }

  if (!context?.organization_id) {
    throw new Error("UBTE: business context with organization_id required");
  }

  const capability =
    getCapabilityDefinition(capabilityId);

  if (!capability) {
    throw new Error(
      `UBTE: capability not registered: ${capabilityId}`
    );
  }

  if (typeof executor !== "function") {
    return {
      success: true,
      dryRun: true,
      capability,
      context,
      payload,
    };
  }

  return executor({
    capability,
    context,
    payload,
  });
}
