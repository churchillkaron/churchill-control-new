import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_concepts";

export const CreativeConceptRepository = {
  async list({
    organization_id,
    creative_project_id = null,
    creative_mission_id = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");

    let query = supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false });

    if (creative_project_id) {
      query = query.eq("creative_project_id", creative_project_id);
    }
    if (creative_mission_id) {
      query = query.eq("creative_mission_id", creative_mission_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async get({
    id,
    organization_id,
    creative_project_id = null,
  } = {}) {
    if (!id) throw new Error("id required");
    if (!organization_id) throw new Error("organization_id required");

    let query = supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization_id);

    if (creative_project_id) {
      query = query.eq("creative_project_id", creative_project_id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async create(document) {
    if (!document?.organization_id) {
      throw new Error("organization_id required");
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(document)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update({
    id,
    organization_id,
    creative_project_id = null,
    values = {},
  } = {}) {
    if (!id) throw new Error("id required");
    if (!organization_id) throw new Error("organization_id required");

    let query = supabaseAdmin
      .from(TABLE)
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", organization_id);

    if (creative_project_id) {
      query = query.eq("creative_project_id", creative_project_id);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  },
};
