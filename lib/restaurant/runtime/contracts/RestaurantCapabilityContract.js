export function defineRestaurantCapability({
  boundedContext,
  capability,
  execute,
}) {

  if (!boundedContext) {
    throw new Error(
      "boundedContext required"
    );
  }

  if (!capability) {
    throw new Error(
      "capability required"
    );
  }

  if (typeof execute !== "function") {
    throw new Error(
      "execute function required"
    );
  }

  return {
    boundedContext,
    capability,
    execute,
  };
}
