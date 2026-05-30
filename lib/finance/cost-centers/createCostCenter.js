import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function createCostCenter({
  tenant_id,
  code,
  name,
  type = null,
  manager = null,
}) {

  try {

    if (!tenant_id) {
      throw new Error("tenant_id required");
    }

    if (!code) {
      throw new Error("code required");
    }

    if (!name) {
      throw new Error("name required");
    }

    const {
      data: existing,
    } = await supabaseAdmin
      .from("cost_centers")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("code", code)
      .maybeSingle();

    if (existing) {
      throw new Error("COST_CENTER_CODE_EXISTS");
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("cost_centers")
      .insert([
        {

          tenant_id,

          code,

          name,

          type,

          manager,

          is_active: true,

          created_at:
            new Date().toISOString(),

          updated_at:
            new Date().toISOString(),

        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      costCenter:
        data,

    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,

    };

  }

}
