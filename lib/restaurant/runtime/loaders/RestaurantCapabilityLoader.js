import {
  getRestaurantCapability,
} from "../registry/RestaurantCapabilityRegistry";

export async function executeRestaurantCapability({
  boundedContext,
  capability,
  payload,
  context,
}) {

  const contract =
    getRestaurantCapability(
      boundedContext,
      capability
    );

  if (!contract) {
    throw new Error(
      `Unknown capability ${boundedContext}.${capability}`
    );
  }

  return contract.execute({
    context,
    payload,
  });

}
