import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";
import createJournalReversal from "@/lib/finance/general-ledger/capabilities/createJournalReversal";
import { MarketingFulfillmentCostRecoveryRuntime } from "@/lib/marketing/intelligence/MarketingFulfillmentCostRecoveryRuntime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value, field) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    const error = new Error(`${field} must be a UUID`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function actorId(access = {}) {
  return access.access?.staffAccountId || access.staff?.id || access.user?.id || null;
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadOriginalSaleMovements({ organizationId, entityId, salesOrderId }) {
  const { data, error } = await supabaseAdmin
    .from("inventory_movements")
    .select("id, item_id, warehouse_id, location_id, quantity, unit_cost, total_cost, movement_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "inventory")
    .eq("source_document", "sales_order")
    .eq("source_document_id", salesOrderId)
    .eq("type", "SALE")
    .order("movement_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function existingReturnMovement({ organizationId, entityId, salesOrderId, originalMovementId }) {
  const { data, error } = await supabaseAdmin
    .from("inventory_movements")
    .select("id, document_id, item_id, quantity, unit_cost, total_cost")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "inventory")
    .eq("source_document", "sales_order_return")
    .eq("source_document_id", salesOrderId)
    .eq("reference_id", originalMovementId)
    .eq("type", "ADJUSTMENT_IN")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findFulfillmentJournal({ organizationId, entityId, salesOrderId }) {
  const { data, error } = await supabaseAdmin
    .from("journal_entries")
    .select("id, reversed, reversal_journal_id, reversed_journal_entry_id, posting_date, currency_code")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "inventory")
    .eq("source_document", "INVENTORY_CONSUMPTION")
    .eq("source_document_id", salesOrderId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function returnSalesOrderFulfillment({ access, body = {}, organizationId }) {
  const entityId = uuid(
    body.entityId || body.entity_id || body.legalEntityId || body.legal_entity_id,
    "entity_id",
  );
  const salesOrderId = uuid(
    body.salesOrderId || body.sales_order_id || body.orderId || body.order_id,
    "sales_order_id",
  );
  const reason = text(body.reason || body.returnReason || body.return_reason);
  const resolvedActorId = actorId(access);

  if (!resolvedActorId || !UUID_PATTERN.test(String(resolvedActorId))) {
    const error = new Error("Authenticated staff identity is required to return a sales-order fulfillment");
    error.status = 403;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
    error.status = 403;
    throw error;
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_number, status, fulfillment_status, currency_code")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", salesOrderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) {
    const error = new Error("Sales order not found in organization and entity scope");
    error.status = 404;
    throw error;
  }

  if (
    String(order.status || "").toUpperCase() !== "FULFILLED" ||
    String(order.fulfillment_status || "").toUpperCase() !== "FULFILLED"
  ) {
    const error = new Error("Only fully fulfilled sales orders can use the full-return workflow");
    error.status = 409;
    throw error;
  }

  const originalMovements = await loadOriginalSaleMovements({ organizationId, entityId, salesOrderId });
  if (!originalMovements.length) {
    const error = new Error("Sales order has no canonical SALE fulfillment movements to return");
    error.status = 409;
    throw error;
  }

  const restoredCost = originalMovements.reduce(
    (sum, movement) => sum + Math.abs(numeric(movement.total_cost)),
    0,
  );

  const fulfillmentJournal = restoredCost > 0
    ? await findFulfillmentJournal({ organizationId, entityId, salesOrderId })
    : null;

  if (restoredCost > 0 && !fulfillmentJournal) {
    const error = new Error(
      "Canonical COGS journal was not found; fulfillment return was not started",
    );
    error.status = 409;
    throw error;
  }

  const restored = [];
  for (const original of originalMovements) {
    const existing = await existingReturnMovement({
      organizationId,
      entityId,
      salesOrderId,
      originalMovementId: original.id,
    });

    if (existing) {
      restored.push({ original_movement_id: original.id, duplicate: true, movement: existing });
      continue;
    }

    const quantity = Math.abs(numeric(original.quantity));
    const unitCost = numeric(original.unit_cost);
    if (quantity <= 0) throw new Error(`Original fulfillment movement ${original.id} has invalid quantity`);
    if (unitCost < 0) throw new Error(`Original fulfillment movement ${original.id} has invalid unit cost`);

    const result = await createInventoryMovement({
      organizationId,
      entityId,
      itemId: original.item_id,
      warehouseId: original.warehouse_id,
      locationId: original.location_id,
      movementType: "ADJUSTMENT_IN",
      quantity,
      unitCost,
      referenceType: "inventory_movement",
      referenceId: original.id,
      sourceModule: "inventory",
      sourceDocument: "sales_order_return",
      sourceDocumentId: salesOrderId,
      notes: reason || `Full return of sales order ${order.order_number || salesOrderId}`,
      createdBy: resolvedActorId,
      postToFinance: false,
    });

    restored.push({
      original_movement_id: original.id,
      duplicate: false,
      movement: result.movement,
      cost_layer: result.costLayer,
      ledger: result.ledger,
    });
  }

  let finance = { reversed: false, skipped: true, reason: "NO_INVENTORY_COST" };
  if (restoredCost > 0) {
    const alreadyReversed = Boolean(
      fulfillmentJournal.reversed ||
        fulfillmentJournal.reversal_journal_id ||
        fulfillmentJournal.reversed_journal_entry_id,
    );

    finance = alreadyReversed
      ? {
          reversed: true,
          duplicate: true,
          journal_entry_id: fulfillmentJournal.id,
          reversal_journal_id:
            fulfillmentJournal.reversal_journal_id ||
            fulfillmentJournal.reversed_journal_entry_id ||
            null,
        }
      : {
          reversed: true,
          duplicate: false,
          journal_entry_id: fulfillmentJournal.id,
          ...(await createJournalReversal({
            organizationId,
            journalEntryId: fulfillmentJournal.id,
            reversalReason: reason || `Sales order fulfillment return ${order.order_number || salesOrderId}`,
            reversedBy: resolvedActorId,
          })),
        };
  }

  let marketing;
  try {
    marketing = await MarketingFulfillmentCostRecoveryRuntime.recoverSalesOrderFulfillment({
      organizationId,
      salesOrderId,
      reason,
    });
  } catch (error) {
    console.error("INVENTORY_MARKETING_COGS_RECOVERY_FAILED", {
      salesOrderId,
      message: error?.message || String(error),
    });
    marketing = {
      projected: false,
      reason: "MARKETING_FULFILLMENT_COGS_RECOVERY_FAILED",
      error: error?.message || String(error),
    };
  }

  return {
    success: true,
    organization_id: organizationId,
    entity_id: entityId,
    sales_order_id: salesOrderId,
    order_number: order.order_number || null,
    return_scope: "FULL_FULFILLMENT",
    restored_movement_count: restored.length,
    restored_cost: restoredCost,
    currency_code: order.currency_code,
    restored,
    finance,
    marketing,
    order_state_note:
      "Sales order remains FULFILLED; return lifecycle state is represented by canonical return movements and Finance reversal until a dedicated Commercial returns document model is introduced.",
  };
}

export default returnSalesOrderFulfillment;
