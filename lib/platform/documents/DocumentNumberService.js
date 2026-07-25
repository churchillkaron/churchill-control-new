import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function generateDocumentNumber({
  organization_id,
  entity_id = null,
  document_type,
  prefix,
  date = new Date(),
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!document_type) {
    throw new Error("document_type required");
  }

  if (!prefix) {
    throw new Error("prefix required");
  }

  const resolvedDate =
    date instanceof Date
      ? date.toISOString().slice(0, 10)
      : String(date || "").slice(0, 10);

  if (!resolvedDate) {
    throw new Error("date required");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "finance_next_document_number",
    {
      p_organization_id: organization_id,
      p_entity_id: entity_id,
      p_document_type: document_type,
      p_prefix: prefix,
      p_document_date: resolvedDate,
    }
  );

  if (error) {
    throw new Error(
      `Document number allocation failed: ${error.message}`
    );
  }

  return data;
}
