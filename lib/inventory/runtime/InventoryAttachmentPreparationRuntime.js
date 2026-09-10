import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  inventoryRowsFromAttachment,
  normalizeInventoryAttachmentRows,
  buildInventoryReview,
  inventoryAttachmentLooksRecognized,
} from "@/lib/inventory/runtime/InventoryAttachmentNormalizer";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }

export async function prepareInventoryAttachment({ file = {}, organizationId, entityId = null } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  const rows = inventoryRowsFromAttachment(file);
  if (!inventoryAttachmentLooksRecognized(file, rows)) {
    return { recognized: false, status: "NOT_INVENTORY_IMPORT", authorization_effect: "NONE" };
  }
  const normalized = normalizeInventoryAttachmentRows(file);
  const codes = [...new Set(normalized.map((row) => row.code).filter(Boolean))];
  let existing = [];
  if (codes.length) {
    let query = supabaseAdmin.from("inventory_items")
      .select("id,entity_id,name,code,type,cost,sale_price,is_active")
      .eq("organization_id", organizationId)
      .in("code", codes.slice(0, 500));
    if (entityId) query = query.eq("entity_id", entityId);
    const result = await query;
    if (result.error) throw result.error;
    existing = result.data || [];
  }
  const reviewed = buildInventoryReview(normalized, existing);
  const count = (state) => reviewed.filter((row) => row.disposition === state).length;
  return {
    recognized: true, type: "inventory_import", status: "READY_FOR_GOVERNED_BULK_IMPORT",
    row_count: reviewed.length, new_count: count("NEW"), existing_count: count("EXISTING"),
    invalid_count: count("INVALID"), ambiguous_count: count("AMBIGUOUS"), rows: reviewed,
    source_attachment_sha256: text(file.sha256, 128) || null, write_capability_available: true,
    clarification_required: count("AMBIGUOUS") > 0,
    clarification_question: count("AMBIGUOUS") > 0
      ? "Some inventory codes match more than one scoped item. Which existing records should those rows use?" : null,
    authorization_effect: "NONE",
  };
}

export default prepareInventoryAttachment;
