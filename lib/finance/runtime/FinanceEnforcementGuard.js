/**
 * FINANCE ENFORCEMENT GUARD (GO LIVE LOCK)
 * Blocks illegal finance entry paths
 */

export function assertFinanceGatewayOnly(context) {
  if (!context || context.__source !== "financeGateway") {
    throw new Error(
      "FINANCE LOCK: only financeGateway can execute financial operations"
    );
  }
}
