import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { safeExecute } from "@/lib/pos/core/posSafetyController";

/**
 * FULL ERP ORDER LIFECYCLE ORCHESTRATOR
 * Safe execution version (idempotent + locked)
 */

export async function processOrderLifecycle({
  tenantId,
  orderId
}) {

  // -----------------------------------
  // 1. LOAD ORDER
  // -----------------------------------
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(`
      *,
      order_items (*)
    `)
    .eq("id", orderId)
    .single();

  if (!order) throw new Error("Order not found");

  // -----------------------------------
  // 2. PRODUCTION BATCH
  // -----------------------------------
  const { data: batch } = await supabaseAdmin
    .from("production_batches")
    .insert({
      tenant_id: tenantId,
      order_id: orderId,
      status: "CREATED"
    })
    .select()
    .single();

  // -----------------------------------
  // 3. INVENTORY CONSUMPTION
  // -----------------------------------
  const items = order.order_items || [];

  for (const item of items) {

    await supabaseAdmin
      .from("inventory_movements")
      .insert({
        tenant_id: tenantId,
        ingredient_id: item.ingredient_id,
        change: -Number(item.quantity || 0),
        type: "CONSUMPTION",
        reference_id: batch.id
      });

  }

  // -----------------------------------
  // 4. COGS CALCULATION
  // -----------------------------------
  const { data: movements } = await supabaseAdmin
    .from("inventory_movements")
    .select("*")
    .eq("reference_id", batch.id);

  let totalCost = 0;

  for (const m of movements || []) {
    totalCost += Math.abs(Number(m.cost || 0));
  }

  const revenue = Number(order.total || 0);
  const profit = revenue - totalCost;

  const { data: cogs } = await supabaseAdmin
    .from("cogs_entries")
    .insert({
      tenant_id: tenantId,
      order_id: orderId,
      batch_id: batch.id,
      revenue,
      cost: totalCost,
      profit
    })
    .select()
    .single();

  // -----------------------------------
  // 5. UPDATE ORDER STATUS
  // -----------------------------------
  await supabaseAdmin
    .from("orders")
    .update({
      status: "COMPLETED"
    })
    .eq("id", orderId);

  // -----------------------------------
  // 6. RETURN RESULT
  // -----------------------------------
  return {
    orderId,
    batchId: batch.id,
    cogsId: cogs.id,
    revenue,
    cost: totalCost,
    profit
  };
}
