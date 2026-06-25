export async function runAuthorization({
  capabilityModule,
  context,
  payload,
}) {
  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  if (
    capabilityModule &&
    typeof capabilityModule.authorize === "function"
  ) {
    return capabilityModule.authorize({
      context,
      payload,
    });
  }

  return true;
}
