export function transitionDocument({
  document,
  definition,
  nextStatus,
}) {
  if (
    !definition.lifecycle.includes(nextStatus)
  ) {
    throw new Error(
      `Invalid status: ${nextStatus}`
    );
  }

  return {
    ...document,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };
}
