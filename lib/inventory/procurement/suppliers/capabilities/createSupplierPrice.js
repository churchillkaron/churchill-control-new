import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();

export default async function createSupplierPrice({
  organizationId, organization_id, entityId = null, entity_id = null,
  supplier_party_id, item_id, price, minimum_order_quantity = 1,
  source_attachment_sha256 = null, source_reference = null, actor_id = null,
}) {
  try {
    const resolvedOrganizationId = text(organizationId || organization_id);
    const resolvedEntityId = text(entityId || entity_id);
    if (!resolvedOrganizationId) throw new Error("organization_id required");
    if (!resolvedEntityId) throw new Error("entity_id required");
    if (!text(supplier_party_id)) throw new Error("supplier_party_id required");
    if (!text(item_id)) throw new Error("item_id required");
    if (!Number.isFinite(Number(price))) throw new Error("price required");
    if (!text(actor_id)) throw new Error("actor_id required");

    const { data, error } = await supabaseAdmin.rpc("procurement_import_supplier_prices_atomic", {
      p_organization_id: resolvedOrganizationId,
      p_entity_id: resolvedEntityId,
      p_supplier_party_id: supplier_party_id,
      p_rows: [{ item_id, price:Number(price), minimum_order_quantity:Number(minimum_order_quantity || 1) }],
      p_source_attachment_sha256: text(source_attachment_sha256) || null,
      p_source_reference: text(source_reference) || null,
      p_actor_id: actor_id,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "supplier price update failed");
    return { success:true, import:data };
  } catch (error) {
    return { success:false, error:error.message };
  }
}
