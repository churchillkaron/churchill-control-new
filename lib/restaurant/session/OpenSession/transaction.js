export async function beginTransaction(context) {
  return {
    ...context,
    transactionStartedAt:
      new Date().toISOString(),
  };
}

export async function commitTransaction(context) {
  return {
    ...context,
    transactionCommittedAt:
      new Date().toISOString(),
  };
}

export async function rollbackTransaction({
  error,
}) {
  return {
    rolledBack: true,
    error:
      error?.message || "Unknown error",
    rolledBackAt:
      new Date().toISOString(),
  };
}
