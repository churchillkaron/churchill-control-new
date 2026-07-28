import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function createCostCenter({
  organization_id,
  entity_id,
  code,
  name,
  type = null,
  manager = null,
}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!entity_id) {
      throw new Error("entity_id required");
    }

    if (!code) {
      throw new Error("code required");
    }

    if (!name) {
      throw new Error("name required");
    }

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from("cost_centers")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("code", code)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      throw new Error("COST_CENTER_CODE_EXISTS");
    }

    const now = new Date().toISOString();
    const {
      data,
      error,
    } = await supabaseAdmin
      .from("cost_centers")
      .insert([
        {
          organization_id,
          entity_id,
          code,
          name,
          type,
          manager,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      costCenter: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
