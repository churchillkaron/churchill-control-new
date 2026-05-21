import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getTenantSetting(
  tenantId,
  category,
  settingKey
) {
  const { data, error } = await supabaseAdmin
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("category", category)
    .eq("setting_key", settingKey)
    .single();

  if (error) {
    console.error("GET TENANT SETTING ERROR:", error);

    return null;
  }

  return data?.setting_value || null;
}
