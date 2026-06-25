export async function runValidation({
  capabilityModule,
  context,
  payload,
}) {
  if (
    capabilityModule &&
    typeof capabilityModule.validate === "function"
  ) {
    return capabilityModule.validate({
      context,
      payload,
    });
  }

  return {
    valid: true,
    payload,
  };
}
