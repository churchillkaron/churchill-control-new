export async function beginTransaction({
  context,
  domain,
  capability,
  action,
}) {
  return {
    context,
    domain,
    capability,
    action,
    startedAt:
      new Date().toISOString(),
  };
}

export async function commitTransaction({
  transaction,
  result,
}) {
  return {
    ...transaction,
    result,
    committedAt:
      new Date().toISOString(),
  };
}

export async function rollbackTransaction({
  transaction,
  error,
}) {
  return {
    ...transaction,
    rolledBack: true,
    error:
      error?.message || "Unknown error",
    rolledBackAt:
      new Date().toISOString(),
  };
}
