import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { runFIFOConsumption } from "./runFIFOConsumption";
import { emitAccountingEvent } from "./emitAccountingEvent";

export async function processCOGSForSale({
  tenantId,
  saleEventId,
  itemId,
  quantity,
  revenueAmount,
  entryDate,
}) {
  const fifo =
    await runFIFOConsumption({
      tenantId,
      itemId,
      quantityNeeded: quantity,
    });

  const cogs =
    Number(fifo.totalCost || 0);

  const revenue =
    Number(revenueAmount || 0);

  const grossProfit =
    revenue - cogs;

  const grossMargin =
    revenue > 0
      ? (
          grossProfit /
          revenue
        ) * 100
      : 0;

  await emitAccountingEvent({
    tenantId,
    eventType: "COGS_POSTING",
    sourceModule: "sales",
    sourceId: saleEventId,
    payload: {
      amount: cogs,
      entryDate,
      description:
        "Automatic COGS posting",
    },
  });

  const { data, error } =
    await supabase
      .from("cogs_postings")
      .insert({
        tenant_id: tenantId,
        sale_event_id:
          saleEventId,
        item_id: itemId,
        quantity,
        revenue_amount:
          revenue,
        cogs_amount: cogs,
        gross_profit:
          grossProfit,
        gross_margin:
          grossMargin,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    fifo,
    posting: data,
  };
}
