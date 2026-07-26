import crypto from "node:crypto";

export const WALLET_TRANSACTION_TYPES = {
  TOPUP: "TOPUP",
  RESERVE: "RESERVE",
  RELEASE: "RELEASE",
  CHARGE: "CHARGE",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
};

export function createWalletTransaction(data = {}) {
  const currency = String(data.currency || "").trim().toUpperCase();
  if (!data.organization_id) throw new Error("organization_id required");
  if (!data.wallet_id) throw new Error("wallet_id required");
  if (!data.type) throw new Error("wallet transaction type required");
  if (!currency) throw new Error("wallet transaction currency required");

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    party_id: data.party_id || null,
    entity_id: data.entity_id || null,
    wallet_id: data.wallet_id,
    type: data.type,
    amount: Number(data.amount || 0),
    currency,
    provider: data.provider || null,
    usage_id: data.usage_id || null,
    invoice_id: data.invoice_id || null,
    reference: data.reference || null,
    idempotency_key: data.idempotency_key || null,
    metadata: data.metadata || {},
    created_at: data.created_at || new Date().toISOString(),
  };
}
