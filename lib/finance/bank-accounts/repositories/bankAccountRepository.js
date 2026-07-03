import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listBankAccounts({ organization_id }) {
  if (!organization_id) throw new Error("organization_id required");

  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function upsertBankAccount({ organization_id, values }) {
  if (!organization_id) throw new Error("organization_id required");

  const now = new Date().toISOString();

  const payload = {
    ...values,
    organization_id,
    updated_at: now,
  };

  if (!payload.id) {
    payload.created_at = now;
  }

  const query = payload.id
    ? supabaseAdmin
        .from("bank_accounts")
        .update(payload)
        .eq("id", payload.id)
    : supabaseAdmin
        .from("bank_accounts")
        .insert(payload);

  const { data, error } = await query.select().single();

  if (error) throw error;

  return data;
}

export async function archiveBankAccount({ organization_id, id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!id) throw new Error("id required");

  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization_id)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}
