import { randomUUID } from "crypto";

export function createPaymentDocument({
  organizationId,
  orderId,
  sessionId,
  amount,
  method,
}) {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    organizationId,
    orderId,
    sessionId,
    amount: Number(amount || 0),
    method,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    paidAt: null,
  };
}
