/**
 * EXECUTION GATE (LEVEL 6 CONTROL CORE)
 * Blocks all AI-driven execution without approval
 */

export function assertApproved(approval) {
  if (!approval || approval.status !== "APPROVED") {
    throw new Error("FINANCE BLOCKED: approval required before execution");
  }

  return true;
}
