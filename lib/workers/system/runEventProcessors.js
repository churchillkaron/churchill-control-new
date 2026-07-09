import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { EVENT_SUBSCRIPTIONS } from "./eventSubscriptions";

import { processWorkCenterEvents } from "@/lib/workers/work-centers/processWorkCenterEvents";
import { processInventoryEvents } from "@/lib/workers/inventory/processInventoryEvents";
import { processFinanceEvents } from "@/lib/workers/finance/processFinanceEvents";

function assertProcessorSuccess(result, label) {
  if (result?.success === false) {
    throw new Error(
      `${label} failed: ${result.error || "unknown error"}`
    );
  }
}

/**
 * IDENTITY-LOCKED EVENT ROUTER
 * Prevents double processing
 */
export async function runEventProcessors() {
  try {
    // STEP 1: ATOMICALLY CLAIM EVENTS
    const { data: events, error } = await supabaseAdmin
      .from("system_events")
      .select("*")
      .eq("processed", false)
      .eq("processing", false)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    if (!events?.length) {
      return { success: true, processed: 0 };
    }

    const eventIds = events.map(e => e.id);

    // LOCK EVENTS (prevents double execution)
    await supabaseAdmin
      .from("system_events")
      .update({
        processing: true,
        processing_started_at: new Date().toISOString()
      })
      .in("id", eventIds);

    let processed = 0;

    for (const event of events) {
      const type = event.type;

      const runWorkCenter =
        EVENT_SUBSCRIPTIONS.WORK_CENTER.includes(type);

      const runInventory =
        EVENT_SUBSCRIPTIONS.INVENTORY.includes(type);

      const runFinance =
        EVENT_SUBSCRIPTIONS.FINANCE.includes(type);

      try {
        if (runWorkCenter) {
          assertProcessorSuccess(
            await processWorkCenterEvents([event]),
            "Work center processor"
          );
        }

        if (runInventory) {
          assertProcessorSuccess(
            await processInventoryEvents([event]),
            "Inventory processor"
          );
        }

        if (runFinance) {
          assertProcessorSuccess(
            await processFinanceEvents([event]),
            "Finance processor"
          );
        }

        // MARK DONE
        await supabaseAdmin
          .from("system_events")
          .update({
            processed: true,
            processing: false,
            processed_at: new Date().toISOString()
          })
          .eq("id", event.id);

        processed++;

      } catch (err) {
        console.error("[EVENT_PROCESS_ERROR]", err);

        // RELEASE LOCK ON FAILURE
        await supabaseAdmin
          .from("system_events")
          .update({
            processing: false
          })
          .eq("id", event.id);
      }
    }

    return {
      success: true,
      processed
    };

  } catch (error) {
    console.error("EVENT_ROUTER_ERROR:", error);

    return {
      success: false,
      error: error.message
    };
  }
}
