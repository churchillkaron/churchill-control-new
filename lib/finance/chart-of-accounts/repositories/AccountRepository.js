import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }
}

export const AccountRepository = {
  async list({
    organizationId,
    entityId = null,
  }) {
    requireOrganizationId(organizationId);

    let query = supabaseAdmin
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("account_code", {
        ascending: true,
      });

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  },

  async get({
    organizationId,
    entityId = null,
    accountId,
  }) {
    requireOrganizationId(organizationId);

    if (!accountId) {
      throw new Error("accountId required");
    }

    let query = supabaseAdmin
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", accountId);

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } =
      await query.maybeSingle();

    if (error) throw error;

    return data || null;
  },

  async findByCode({
    organizationId,
    entityId = null,
    accountCode,
    excludeId = null,
  }) {
    requireOrganizationId(organizationId);

    if (!accountCode) {
      throw new Error("accountCode required");
    }

    let query = supabaseAdmin
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("account_code", accountCode);

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } =
      await query.limit(1).maybeSingle();

    if (error) throw error;

    return data || null;
  },

  async upsert({
    organizationId,
    entityId = null,
    accountId = null,
    values,
  }) {
    requireOrganizationId(organizationId);

    const record = {
      organization_id: organizationId,
      entity_id: entityId,
      account_code: values.account_code,
      account_name: values.account_name,
      account_category: values.account_category || null,
      account_type: values.account_type,
      parent_account_id: values.parent_account_id || null,
      normal_balance: values.normal_balance || null,
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
      : supabaseAdmin
          .from("chart_of_accounts")
          .insert(record);

    const { data, error } =
      await query.select().single();

    if (error) throw error;

    return data;
  },

  async countLedgerUsage({
    organizationId,
    accountId,
  }) {
    requireOrganizationId(organizationId);

    const { count, error } = await supabaseAdmin
      .from("general_ledger")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", organizationId)
      .eq("account_id", accountId);

    if (error) {
      const fallback =
        await supabaseAdmin
          .from("journal_entry_lines")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("organization_id", organizationId)
          .eq("account_id", accountId);

      if (fallback.error) {
        throw fallback.error;
      }

      return fallback.count || 0;
    }

    return count || 0;
  },

  async remove({
    organizationId,
    entityId = null,
    accountId,
  }) {
    requireOrganizationId(organizationId);

    if (!accountId) {
      throw new Error("accountId required");
    }

    let query = supabaseAdmin
      .from("chart_of_accounts")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", accountId);

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } =
      await query.select().maybeSingle();

    if (error) throw error;

    return data || null;
  },
};
