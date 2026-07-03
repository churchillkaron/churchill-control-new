export function assertFinanceGatewayOnly(context) {
  if (!context || context.__source !== "financeGateway") {
    throw new Error(
      "FINANCE LOCK VIOLATION: Only financeGateway is allowed to initiate financial execution"
    );
  }
}
