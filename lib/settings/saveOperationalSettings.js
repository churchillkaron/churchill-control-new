import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function saveOperationalSettings({
  tenantId,
  domain,
  settings = {},
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("operational_settings")
    .upsert({
      tenant_id: tenantId,
      domain,
      settings,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "tenant_id,domain",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;

}
