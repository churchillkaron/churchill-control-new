import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createVendor({
  tenant_id,
  vendor_name,
  contact_name = null,
  phone = null,
  email = null,
  address = null,
  lead_time_days = 1,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("vendors")
      .insert([
        {

          tenant_id,

          vendor_name,

          contact_name,

          phone,

          email,

          address,

          lead_time_days,

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

      vendor:
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
