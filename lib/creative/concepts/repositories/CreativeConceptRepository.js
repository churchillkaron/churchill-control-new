import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_concepts";

export const CreativeConceptRepository = {

  async list(organization_id) {

    const { data, error } =
      await supabaseAdmin
        .from(TABLE)
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at");

    if (error) throw error;

    return data || [];

  },

  async create(document) {

    const { data, error } =
      await supabaseAdmin
        .from(TABLE)
        .insert(document)
        .select()
        .single();

    if (error) throw error;

    return data;

  },

};
