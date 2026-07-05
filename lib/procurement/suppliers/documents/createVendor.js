import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function createVendor({

  organization_id,

  vendor_code = null,

  legal_name,

  display_name,

  tax_id = null,

  email = null,

  phone = null,

  address = null,

  payment_terms = null,

  default_expense_account = null,

  default_ap_account = null,

  risk_level = "LOW",

  notes = null,

  is_active = true,

  is_blocked = false,

}) {

  try {

    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!legal_name) {
      throw new Error("legal_name required");
    }

    if (!display_name) {
      throw new Error("display_name required");
    }

    const now =
      new Date().toISOString();

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("vendors")

      .insert([{

        organization_id,

        vendor_code,

        legal_name,

        display_name,

        tax_id,

        email,

        phone,

        address,

        payment_terms,

        default_expense_account,

        default_ap_account,

        risk_level,

        notes,

        is_active,

        is_blocked,

        created_at: now,

        updated_at: now,

      }])

      .select()

      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      vendor: data,

    };

  } catch (error) {

    return {

      success: false,

      error: error.message,

    };

  }

}
