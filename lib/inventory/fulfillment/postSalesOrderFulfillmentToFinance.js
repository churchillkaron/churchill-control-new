import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function postSalesOrderFulfillmentToFinance({
  organizationId,
  entityId,
  salesOrderId,
  actorId = null,
}) {
  const [orderResult, entityResult, movementResult] = await Promise.all([
    supabaseAdmin
      .from("sales_orders")
      .select("id, order_number, currency_code, updated_at")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", salesOrderId)
      .maybeSingle(),
    supabaseAdmin
      .from("legal_entities")
      .select("id, currency")
      .eq("organization_id", organizationId)
      .eq("id", entityId)
      .maybeSingle(),
    supabaseAdmin
      .from("inventory_movements")
      .select("id, total_cost, movement_date")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("source_module", "inventory")
      .eq("source_document", "sales_order")
      .eq("source_document_id", salesOrderId)
      .eq("type", "SALE"),
  ]);

  if (orderResult.error) throw orderResult.error;
  if (entityResult.error) throw entityResult.error;
  if (movementResult.error) throw movementResult.error;
  if (!orderResult.data) throw new Error("Fulfilled sales order was not found");
  if (!entityResult.data) throw new Error("Fulfillment entity was not found");

  const movements = movementResult.data || [];
  const amount = movements.reduce(
    (total, movement) => total + numeric(movement.total_cost),
    0,
  );

  if (amount <= 0) {
    return {
      success: true,
      skipped: true,
      reason: "NO_INVENTORY_COST",
      amount: 0,
    };
  }

  const currencyCode = String(entityResult.data.currency || "")
    .trim()
    .toUpperCase();

  if (!currencyCode) {
    throw new Error("Fulfillment entity currency is not configured");
  }

  const postingDate = String(
    movements
      .map((movement) => movement.movement_date)
      .filter(Boolean)
      .sort()
      .at(-1) || orderResult.data.updated_at || new Date().toISOString(),
  ).slice(0, 10);

  const accounting = await financeGateway({
    type: "INVENTORY_CONSUMPTION",
    payload: {
      organization_id: organizationId,
      entity_id: entityId,
      source_module: "inventory",
      source_id: salesOrderId,
      source_document: "sales_order",
      source_document_id: salesOrderId,
      amount,
      currency_code: currencyCode,
      exchange_rate: 1,
      entry_date: postingDate,
      document_date: postingDate,
      description: `Sales order fulfillment ${orderResult.data.order_number || salesOrderId}`,
      created_by: actorId,
    },
  });

  return {
    success: true,
    skipped: false,
    amount,
    currency_code: currencyCode,
    accounting,
  };
}

export default postSalesOrderFulfillmentToFinance;
