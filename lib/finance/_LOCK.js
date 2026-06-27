/**
 * FINANCE SYSTEM LOCK
 * Prevents direct bypass usage patterns
 */

export function assertFinanceGatewayOnly(caller) {
  if (!caller || caller !== "financeGateway") {
    throw new Error(
      "FINANCE LOCK: direct finance usage forbidden. Use financeGateway."
    );
  }
}
