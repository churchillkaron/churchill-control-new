import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CreativeProjectsRuntime = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from("creative_assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("creative_assets error:", error);
      return [];
    }

    return data || [];
  },

  async create(input) {
    const { data, error } = await supabaseAdmin
      .from("creative_assets")
      .insert({
        name: input.name || "New Asset",
        type: "project_root",
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  }
};
