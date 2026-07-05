import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

export async function createPurchaseRequest({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  item,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!item) {
    throw new Error("item required");
  }

  const currentQuantity =
    Number(item.quantity || 0);

  const reorderLevel =
    Number(
      item.reorder_level ||
      item.min_quantity ||
      5
    );

  const reorderQuantity =
    Math.max(reorderLevel * 2, 10);

  const request = {
    organization_id: resolvedOrganizationId,
    entity_id: resolvedEntityId,

    item_id: item.id,

    request_type: "LOW_STOCK_AUTO",

    status: "PENDING",

    quantity: reorderQuantity,

    current_quantity: currentQuantity,

    reorder_level: reorderLevel,

    notes: `Auto-generated from inventory automation for ${item.name}`,

    created_at: new Date().toISOString(),
  };

  const {
    data,
    error,
  } = await supabase
    .from("purchase_requests")
    .insert(request)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    success: true,
    purchaseRequest: data,
  };
}
