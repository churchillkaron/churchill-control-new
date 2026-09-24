import {
  WalletRuntime,
} from "../../runtime/WalletRuntime.js";

export async function execute({
  context,
  payload = {},
}) {
  const reference = String(payload.reference || "").trim();
  if (!reference) throw new Error("WALLET_TOPUP_REFERENCE_REQUIRED");

  return WalletRuntime.topup({
    organization_id: context.organizationId,
    amount: payload.amount,
    currency: payload.currency,
    reference,
    provider: payload.provider || null,
    metadata: {
      payment_method: payload.payment_method || null,
      notes: payload.notes || null,
    },
  });
}
