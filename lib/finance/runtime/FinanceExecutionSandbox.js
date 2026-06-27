/**
 * FINANCE EXECUTION SANDBOX
 * HARD GUARD AGAINST DIRECT CALLS
 */

export function assertFinanceOrigin(context) {
  if (!context) {
    throw new Error("FINANCE SANDBOX: missing context");
  }

  if (context.__source !== "financeGateway") {
    throw new Error(
      "FINANCE VIOLATION: direct finance execution blocked (must use financeGateway)"
    );
  }

  if (!context.entity_id) {
    throw new Error("FINANCE SANDBOX: entity_id required");
  }

  return true;
}
