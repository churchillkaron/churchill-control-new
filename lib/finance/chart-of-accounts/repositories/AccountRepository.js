import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }
}

function requireEntityId(entityId) {
  if (!entityId) {
    throw new Error("entityId required");
  }
}

export const AccountRepository = {
  async list({ organizationId, entityId }) {
    requireOrganizationId(organizationId);
    requireEntityId(entityId);

    const { data, error } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .order("account_code", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async get({ organizationId, entityId, accountId }) {
    requireOrganizationId(organizationId);
    requireEntityId(entityId);

    if (!accountId) {
      throw new Error("accountId required");
    }

    const { data, error } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", accountId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },

  async findByCode({
    organizationId,
    entityId,
    accountCode,
    excludeId = null,
  }) {
    requireOrganizationId(organizationId);
    requireEntityId(entityId);

    if (!accountCode) {
      throw new Error("accountCode required");
    }

    let query = supabaseAdmin
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("account_code", accountCode);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async upsert({
    organizationId,
    entityId,
    accountId = null,
    values,
  }) {
    requireOrganizationId(organizationId);
    requireEntityId(entityId);

    const record = {
      organization_id: organizationId,
      entity_id: entityId,
      account_code: values.account_code,
      account_name: values.account_name,
      account_category: values.account_category,
      account_type: values.account_type,
      parent_account_id: values.parent_account_id || null,
      normal_balance: values.normal_balance,
      currency_code: values.currency_code,
      is_active: values.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    const query = accountId
      ? supabaseAdmin
          .from("chart_of_accounts")
          .update(record)
          .eq("id", accountId)
          .eq("organization_id", organizationId)
          .eq("entity_id", entityId)
      : supabaseAdmin
          .from("chart_of_accounts")
          .insert(record);

    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  },

  async countLedgerUsage({ organizationId, entityId, accountId }) {
    requireOrganizationId(organizationId);
    requireEntityId(entityId);

    const { count, error } = await supabaseAdmin
      .from("general_ledger")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("account_id", accountId);

    if (!error) {
      return count || 0;
    }

    const fallback = await supabaseAdmin
      .from("journal_entry_lines")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("account_id", accountId);

    if (fallback.error) throw fallback.error;
    return fallback.count || 0;
  },

  async archive({ organizationId, entityId, accountId }) {
    requireOrganizationId(organizationId);
    requireEntityId(entityId);

    if (!accountId) {
      throw new Error("accountId required");
    }

    const { data, error } = await supabaseAdmin
      .from("chart_of_accounts")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", accountId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },
};
