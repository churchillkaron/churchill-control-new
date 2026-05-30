import { supabase } from "@/lib/supabase";

import { publishAccountingEvent } from "@/lib/finance/core/publishAccountingEvent";
import { postCOGSJournal } from "@/lib/finance/core/postCOGSJournal";
import { runProfitabilityEngine } from "@/lib/intelligence/finance/runProfitabilityEngine";
import { calculateTax } from "@/lib/finance/core/calculateTax";

export async function runOrderCompletedFlow({
  tenantId,
  orderId,
  revenue,
  cogs,
  laborCost,
  taxName,
}) {
  const executionSteps = [];

  const log =
    await supabase
      .from(
        "orchestration_execution_logs"
      )
      .insert({
        tenant_id: tenantId,
        orchestration_type:
          "ORDER_COMPLETED",
        reference_id: orderId,
        execution_steps: [],
      })
      .select()
      .single();

  try {
    executionSteps.push(
      "EVENT_PUBLISHED"
    );

    await publishAccountingEvent({
      tenantId,
      eventType:
        "ORDER_COMPLETED",
      eventPayload: {
        orderId,
      },
    });

    executionSteps.push(
      "COGS_POSTED"
    );

    await postCOGSJournal({
      tenantId,
      referenceType:
        "ORDER",
      referenceId: orderId,
      inventoryValue:
        cogs,
      cogsValue: cogs,
    });

    executionSteps.push(
      "PROFITABILITY_UPDATED"
    );

    await runProfitabilityEngine({
      tenantId,
      referenceType:
        "ORDER",
      referenceId: orderId,
      revenue,
      cogs,
      laborCost,
      overheadCost: 0,
    });

    executionSteps.push(
      "TAX_CALCULATED"
    );

    await calculateTax({
      tenantId,
      referenceType:
        "ORDER",
      referenceId: orderId,
      taxableAmount:
        revenue,
      taxName,
    });

    await supabase
      .from(
        "orchestration_execution_logs"
      )
      .update({
        execution_status:
          "completed",
        execution_steps:
          executionSteps,
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", log.data.id);

    return {
      success: true,
      executionSteps,
    };
  } catch (error) {
    await supabase
      .from(
        "orchestration_execution_logs"
      )
      .update({
        execution_status:
          "failed",
        execution_steps:
          executionSteps,
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", log.data.id);

    throw error;
  }
}
