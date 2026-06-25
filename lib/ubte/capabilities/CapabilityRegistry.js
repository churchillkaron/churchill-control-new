import { RESTAURANT_CAPABILITIES } from "@/lib/restaurant/RestaurantCapabilityRegistry";

export const CAPABILITY_REGISTRY = {
  ...RESTAURANT_CAPABILITIES,
};

export function getCapabilityDefinition({
  domain,
  capability,
  action,
}) {
  const definition =
    CAPABILITY_REGISTRY?.[domain]?.[capability]?.[action];

  if (!definition) {
    throw new Error(
      `Capability not registered: ${domain}.${capability}.${action}`
    );
  }

  return definition;
}
