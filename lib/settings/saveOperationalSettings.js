import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function saveOperationalSettings({
  organizationId,
  domain,
  settings = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!domain) {
    throw new Error("domain required");
  }

  const { data, error } = await supabaseAdmin
    .from("operational_settings")
    .upsert(
      {
        organization_id: organizationId,
        domain,
        settings,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,domain",
      }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
