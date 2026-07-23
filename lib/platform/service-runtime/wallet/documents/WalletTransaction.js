export const WALLET_TRANSACTION_TYPES = {
  TOPUP: "TOPUP",
  RESERVE: "RESERVE",
  RELEASE: "RELEASE",
  CHARGE: "CHARGE",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
};

function requiredCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("WALLET_TRANSACTION_CURRENCY_REQUIRED");
  }
  return currency;
}

export function createWalletTransaction(data = {}) {
  return {
    id: crypto.randomUUID(),
    organization_id: data.organization_id,
    party_id: data.party_id || null,
    entity_id: data.entity_id || null,
    wallet_id: data.wallet_id,
    type: data.type,
    amount: Number(data.amount || 0),
    currency: requiredCurrency(data.currency),
    provider: data.provider || null,
    usage_id: data.usage_id || null,
    invoice_id: data.invoice_id || null,
    reference: data.reference || null,
    metadata: data.metadata || {},
    created_at: new Date().toISOString(),
  };
}
