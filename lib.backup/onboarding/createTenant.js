import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createTenant({
  name,
  slug,
}) {
  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .insert([
        {
          name,
          slug,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      tenant: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
