export const WALLET_TRANSACTION_TYPES = {
  TOPUP: "TOPUP",
  RESERVE: "RESERVE",
  RELEASE: "RELEASE",
  CHARGE: "CHARGE",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
};

export function createWalletTransaction(data = {}) {
  return {
    id: crypto.randomUUID(),

    organization_id: data.organization_id,

    wallet_id: data.wallet_id,

    type: data.type,

    amount: Number(data.amount || 0),

    currency: data.currency || "USD",

    provider: data.provider || null,

    usage_id: data.usage_id || null,

    invoice_id: data.invoice_id || null,

    reference: data.reference || null,

    metadata: data.metadata || {},

    created_at: new Date().toISOString(),
  };
}
