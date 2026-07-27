import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const WRITABLE_FIELDS = new Set([
  "id",
  "entity_id",
  "bank_name",
  "account_name",
  "account_number",
  "currency",
  "branch_name",
  "active",
]);

function normalizeValues(values = {}) {
  const normalized = {
    ...values,
    currency:
      values.currency ||
      values.currency_code ||
      values.currencyCode ||
      null,
    entity_id:
      values.entity_id ||
      values.entityId ||
      null,
  };

  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([key, value]) =>
        WRITABLE_FIELDS.has(key) &&
        value !== undefined
      )
  );
}

export async function listBankAccounts({ organization_id, entity_id = null }) {
  if (!organization_id) throw new Error("organization_id required");

  let query = supabaseAdmin
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", organization_id);

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function upsertBankAccount({ organization_id, values }) {
  if (!organization_id) throw new Error("organization_id required");

  const normalized = normalizeValues(values);
  if (!normalized.entity_id) throw new Error("entity_id required");
  if (!normalized.bank_name) throw new Error("bank_name required");
  if (!normalized.account_name) throw new Error("account_name required");
  if (!normalized.account_number) throw new Error("account_number required");
  if (!normalized.currency) throw new Error("currency required");

  const now = new Date().toISOString();
  const payload = {
    ...normalized,
    organization_id,
    updated_at: now,
  };

  if (!payload.id) {
    payload.created_at = now;
  }

  let query;

  if (payload.id) {
    const id = payload.id;
    delete payload.id;

    query = supabaseAdmin
      .from("bank_accounts")
      .update(payload)
      .eq("organization_id", organization_id)
      .eq("entity_id", normalized.entity_id)
      .eq("id", id);
  } else {
    query = supabaseAdmin
      .from("bank_accounts")
      .insert(payload);
  }

  const { data, error } = await query.select().single();

  if (error) throw error;

  return data;
}

export async function archiveBankAccount({ organization_id, entity_id = null, id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!id) throw new Error("id required");

  let query = supabaseAdmin
    .from("bank_accounts")
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization_id)
    .eq("id", id);

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query
    .select()
    .single();

  if (error) throw error;

  return data;
}
