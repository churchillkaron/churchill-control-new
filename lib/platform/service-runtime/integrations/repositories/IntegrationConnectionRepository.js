import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "integration_connections";

export const IntegrationConnectionRepository = {

  async list(organization_id) {

    const { data, error } =
      await supabaseAdmin
        .from(TABLE)
        .select("*")
        .eq("organization_id", organization_id)
        .order("category");

    if (error) throw error;

    return data || [];
  },

  async get(
    organization_id,
    provider
  ) {

    const { data, error } =
      await supabaseAdmin
        .from(TABLE)
        .select("*")
        .eq("organization_id", organization_id)
        .eq("provider", provider)
        .maybeSingle();

    if (error) throw error;

    return data;
  },

  async save(connection) {

    const { data, error } =
      await supabaseAdmin
        .from(TABLE)
        .upsert(connection, {
          onConflict:
            "organization_id,provider",
        })
        .select()
        .single();

    if (error) throw error;

    return data;
  },

};
