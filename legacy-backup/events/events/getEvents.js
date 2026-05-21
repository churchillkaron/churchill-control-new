import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getEvents({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("system_events")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(100);

    if (error) {
      throw error;
    }

    return {
      success: true,
      events:
        data || [],
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
