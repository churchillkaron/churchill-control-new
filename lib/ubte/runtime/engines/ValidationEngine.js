export async function runValidation({
  capabilityModule,
  context,
  payload,
}) {

  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  if (
    capabilityModule &&
    typeof capabilityModule.validate === "function"
  ) {
    return capabilityModule.validate({
      context,
      payload,
    });
  }

  return true;
}
