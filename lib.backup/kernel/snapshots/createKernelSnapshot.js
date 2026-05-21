import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createKernelSnapshot({
  tenant_id,
  kernel_state,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("kernel_snapshots")
      .insert([
        {

          tenant_id,

          snapshot: kernel_state,

          created_at:
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

      snapshot:
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
