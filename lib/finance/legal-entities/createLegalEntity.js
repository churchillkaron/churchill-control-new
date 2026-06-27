import { createServerSupabase } from "@/lib/shared/supabase/server";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function createLegalEntity({
  organization_id,
  code,
  legal_name,
  display_name = null,
  tax_id = null,
  registration_number = null,
  country = null,
  currency = "THB",
  address = null,
  phone = null,
  email = null,
  is_holding_company = false,
}) {

  try {

    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!code) {
      throw new Error("code required");
    }

    if (!legal_name) {
      throw new Error("legal_name required");
    }

    const {
      data: existing,
    } = await supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("code", code)
      .maybeSingle();

    if (existing) {
      throw new Error("ENTITY_CODE_ALREADY_EXISTS");
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("legal_entities")
      .insert([
        {

          organization_id,

          code,

          legal_name,

          display_name,

          tax_id,

          registration_number,

          country,

          currency,

          address,

          phone,

          email,

          is_holding_company,

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

      entity:
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
