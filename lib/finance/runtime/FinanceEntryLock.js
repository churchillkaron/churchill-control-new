/**
 * FINANCE ENTRY LOCK (HARD RULE)
 * ONLY financeGateway is allowed to start financial execution
 */

export function assertGateway(context) {
  if (!context || context.__source !== "financeGateway") {
    throw new Error("FINANCE LOCK: only financeGateway allowed");
  }
}
