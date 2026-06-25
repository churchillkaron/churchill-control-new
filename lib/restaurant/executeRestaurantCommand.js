import { executeSessionCommand } from "./session/SessionService";

export async function executeRestaurantCommand({
  organizationId,
  capability,
  action,
  payload = {},
  actor = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!capability) {
    throw new Error("Restaurant capability required");
  }

  if (!action) {
    throw new Error("Restaurant action required");
  }

  if (capability === "session") {
    return executeSessionCommand({
      organizationId,
      action,
      payload,
      actor,
    });
  }

  throw new Error(
    `Unsupported restaurant capability: ${capability}`
  );
}
