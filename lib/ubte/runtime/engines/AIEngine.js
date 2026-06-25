export async function runAIHooks({
  capabilityModule,
  context,
  payload,
  result,
}) {
  if (
    capabilityModule &&
    typeof capabilityModule.runAIHooks === "function"
  ) {
    return capabilityModule.runAIHooks({
      context,
      payload,
      result,
    });
  }

  return {
    insights: [],
  };
}
