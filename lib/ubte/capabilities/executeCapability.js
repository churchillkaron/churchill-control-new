import { getCapabilityDefinition } from "./CapabilityRegistry";

const EXECUTORS = {
  "restaurant.session.OpenSession": async () =>
    import("@/lib/restaurant/session/OpenSession/execute"),

  "restaurant.session.CloseSession": async () =>
    import("@/lib/restaurant/session/CloseSession/execute"),

  "restaurant.session.MoveGuests": async () =>
    import("@/lib/restaurant/session/MoveGuests/execute"),

  "restaurant.session.SplitSessionGroup": async () =>
    import("@/lib/restaurant/session/SplitSessionGroup/execute"),

  "restaurant.session.GetActiveSession": async () =>
    import("@/lib/restaurant/session/GetActiveSession/execute"),

  "restaurant.session.GetLiveSessionState": async () =>
    import("@/lib/restaurant/session/GetLiveSessionState/execute"),

  "restaurant.session.LoadMergedSessionOrders": async () =>
    import("@/lib/restaurant/session/LoadMergedSessionOrders/execute"),
};

export async function executeCapability({
  organizationId,
  domain,
  capability,
  action,
  payload = {},
  actor = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  getCapabilityDefinition({
    domain,
    capability,
    action,
  });

  const key = `${domain}.${capability}.${action}`;
  const loader = EXECUTORS[key];

  if (!loader) {
    throw new Error(`Capability executor not found: ${key}`);
  }

  const module = await loader();

  if (typeof module.execute !== "function") {
    throw new Error(`Capability missing execute(): ${key}`);
  }

  return module.execute({
    organizationId,
    payload,
    actor,
  });
}
