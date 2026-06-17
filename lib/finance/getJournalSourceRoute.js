import { createServerSupabase } from "@/lib/shared/supabase/server";
export function getJournalSourceRoute(
  sourceType,
  sourceId,
) {

  if (
    !sourceType ||
    !sourceId
  ) {

    return null;

  }

  const routes = {

    POS_ORDER:
      `/pos/orders/${sourceId}`,

    PURCHASE_RECEIPT:
      `/procurement/receipts/${sourceId}`,

    PURCHASE_ORDER:
      `/procurement/purchase-orders/${sourceId}`,

    PAYROLL_RUN:
      `/payroll/runs/${sourceId}`,

    INVENTORY_MOVEMENT:
      `/inventory/movements/${sourceId}`,

    PRODUCTION_BATCH:
      `/production/batches/${sourceId}`,

    MANUAL_JOURNAL:
      `/finance/journals/${sourceId}`,

    AP_INVOICE:
      `/finance/accounts-payable/${sourceId}`,

    AR_INVOICE:
      `/finance/accounts-receivable/${sourceId}`,

    FIXED_ASSET:
      `/finance/fixed-assets/${sourceId}`,

  };

  return (
    routes[sourceType] || null
  );

}
