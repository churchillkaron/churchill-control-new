export function assertFinanceGatewayOnly(caller) {
  if (caller !== "financeGateway") {
    throw new Error("FINANCE LOCK: only financeGateway allowed");
  }
}
