import { createServerSupabase } from "@/lib/shared/supabase/server";
import { postAccountingEvent } from "@/lib/finance/postAccountingEvent";

export async function postCOGS({
  organizationId,
  saleId,
  amount,
  accounts,
}) {
  return await postAccountingEvent({
    organizationId,
    eventType: "COGS_POSTED",
    sourceModule: "inventory",
    sourceId: saleId,
    description: `COGS for sale ${saleId}`,
    amount,
    accounts,
    metadata: {
      saleId,
    },
  });
}
