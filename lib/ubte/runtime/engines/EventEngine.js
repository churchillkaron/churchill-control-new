export async function publishEvents({
  capabilityModule,
  context,
  payload,
  result,
}) {
  if (
    capabilityModule &&
    typeof capabilityModule.publish === "function"
  ) {
    return capabilityModule.publish({
      context,
      payload,
      result,
    });
  }

  return [];
}
