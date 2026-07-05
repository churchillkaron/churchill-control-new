import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * PURE FINANCE WORKER
 * No DB querying of system_events inside
 */
export async function processFinanceEvents(events = []) {
  try {
    if (!events.length) {
      return { success: true, processed: 0 };
    }

    let processed = 0;

    for (const event of events) {
      const payload = event.payload || {};
      const type = event.type;

      const organizationId = payload.organization_id;
      const orderId = payload.order_id;
      const total = payload.total || 0;
      const items = payload.items || [];

      if (!organizationId || !orderId) {
        continue;
      }

      if (type === "ORDER_COMPLETED") {

        // Revenue
        await supabaseAdmin.from("finance_transactions").insert({
          organization_id: organizationId,
          reference_type: "ORDER",
          reference_id: orderId,
          transaction_type: "REVENUE",
          amount: total,
          metadata: {
            source: "EVENT_ENGINE",
            event_id: event.id
          }
        });

        // COGS
        let cogs = 0;

        for (const item of items) {
          cogs += (item.cost || 0) * (item.quantity || 1);
        }

        if (cogs > 0) {
          await supabaseAdmin.from("finance_transactions").insert({
            organization_id: organizationId,
            reference_type: "ORDER",
            reference_id: orderId,
            transaction_type: "COGS",
            amount: cogs,
            metadata: {
              source: "EVENT_ENGINE",
              event_id: event.id
            }
          });
        }

        processed++;
      }
    }

    return {
      success: true,
      processed
    };

  } catch (error) {
    console.error("[FINANCE_WORKER_ERROR]", error);

    return {
      success: false,
      error: error.message
    };
  }
}
