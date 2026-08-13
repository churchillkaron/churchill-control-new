import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listPaymentTerms({ organization_id }) {
  const { data, error } = await supabaseAdmin
    .from("payment_terms")
    .select("*")
    .eq("organization_id", organization_id)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertPaymentTerm({ organization_id, values }) {
  const sanitizedValues = { ...(values || {}) };
  delete sanitizedValues.organization_id;
  delete sanitizedValues.organizationId;
  delete sanitizedValues.tenant_id;
  delete sanitizedValues.tenantId;

  const recordId = sanitizedValues.id || null;
  if (recordId) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("payment_terms")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("id", recordId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      throw new Error("Payment term not found in this organisation");
    }
  }

  const { data, error } = await supabaseAdmin
    .from("payment_terms")
    .upsert({
      ...sanitizedValues,
      organization_id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function archivePaymentTerm({ organization_id, id }) {
  const { error } = await supabaseAdmin
    .from("payment_terms")
    .update({ status: "ARCHIVED" })
    .eq("organization_id", organization_id)
    .eq("id", id);

  if (error) throw error;
  return true;
}
