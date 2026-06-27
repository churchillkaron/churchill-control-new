import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function findAccount({
  organizationId,
  entityId,
  accountCode,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  if (!accountCode) {
    throw new Error("accountCode required");
  }

  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("account_code", accountCode)
    .eq("is_active", true)
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      `Account ${accountCode} not found`
    );
  }

  return data;
}
