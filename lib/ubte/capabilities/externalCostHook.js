import { recordExternalCost } from "@/lib/platform/billing/cost-ledger/ExternalCostLedger";

/**
 * ONLY CALL THIS WHEN REAL MONEY IS SPENT OUTSIDE SYSTEM
 */

export function trackExternalCost({
  organization_id,
  provider,
  type,
  amount,
  reference
}) {
  if (!amount || amount <= 0) return;

  recordExternalCost({
    organization_id,
    provider,
    type,
    amount,
    reference
  });
}
