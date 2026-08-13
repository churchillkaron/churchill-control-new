import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

async function postReceiptMovementToFinance({
  organizationId,
  entityId,
  entry,
}) {
  const movement = entry?.movement || null;
  const document = entry?.document || null;

  if (!movement || !document) {
    throw new Error("invalid procurement receiving movement result");
  }

  const amount = Number(
    document.total_cost ?? movement.total_cost ?? 0,
  );

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("invalid procurement receiving movement cost");
  }

  let accounting = null;

  if (amount > 0) {
    accounting = await financeGateway({
      type: "INVENTORY_RECEIPT",
      payload: {
        organization_id: organizationId,
        entity_id: entityId,
        source_module: "procurement",
        source_id: document.id,
        source_document: "inventory_documents",
        source_document_id: document.id,
        movement_id: movement.id,
        item_id: movement.item_id || document.item_id,
        movement_type: "GOODS_RECEIPT",
        amount,
        entryDate: String(
          document.movement_date || movement.movement_date || new Date().toISOString(),
        ).slice(0, 10),
        description: "Inventory GOODS_RECEIPT",
      },
    });

    const journalEntryId = accounting?.journal?.id || null;

    if (journalEntryId && document.journal_entry_id !== journalEntryId) {
      const { error: linkError } = await supabaseAdmin
        .from("inventory_documents")
        .update({ journal_entry_id: journalEntryId })
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .eq("id", document.id);

      if (linkError) {
        throw linkError;
      }

      document.journal_entry_id = journalEntryId;
    }
  }

  return {
    success: true,
    document,
    movement,
    accounting,
  };
}

export default async function receivePurchaseOrder({
  organization_id,
  entity_id = null,
  purchase_order_id,
  received_by = "WAREHOUSE",
  actor_id = null,
}) {
  try {
    if (!organization_id) throw new Error("organization_id required");
    if (!purchase_order_id) throw new Error("purchase_order_id required");
    if (!actor_id) throw new Error("actor_id required");

    const { data, error } = await supabaseAdmin.rpc(
      "receive_purchase_order_atomic_rpc",
      {
        p_organization_id: organization_id,
        p_entity_id: entity_id,
        p_purchase_order_id: purchase_order_id,
        p_received_by: received_by,
        p_actor_id: actor_id,
      },
    );

    if (error) throw error;
    if (!data?.success) {
      throw new Error(data?.error || "purchase order receiving failed");
    }

    const resolvedEntityId =
      data.purchase_order?.entity_id ||
      data.goods_receipt?.entity_id ||
      entity_id ||
      null;

    if (!resolvedEntityId) {
      throw new Error("entity_id required after receiving");
    }

    const inventoryMovements = [];

    for (const entry of data.inventory_movements || []) {
      inventoryMovements.push(
        await postReceiptMovementToFinance({
          organizationId: organization_id,
          entityId: resolvedEntityId,
          entry,
        }),
      );
    }

    return {
      ...data,
      inventory_movements: inventoryMovements,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
