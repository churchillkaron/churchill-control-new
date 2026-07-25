const authorizedFinanceGatewayContexts = new WeakSet();

export function authorizeFinanceGatewayContext(context) {
  if (!context || typeof context !== "object") {
    throw new Error(
      "FINANCE LOCK VIOLATION: Finance gateway context must be an object"
    );
  }

  authorizedFinanceGatewayContexts.add(context);
  return context;
}

export function assertFinanceGatewayOnly(context) {
  if (
    !context ||
    typeof context !== "object" ||
    !authorizedFinanceGatewayContexts.has(context)
  ) {
    throw new Error(
      "FINANCE LOCK VIOLATION: Only financeGateway is allowed to initiate financial execution"
    );
  }
}
