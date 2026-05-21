import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function resolveTenant(userId) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("staff_accounts")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      tenant_id:
        data?.tenant_id,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
