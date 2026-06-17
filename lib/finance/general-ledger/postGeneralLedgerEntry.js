import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function postGeneralLedgerEntry({
  tenant_id,
  account_name,
  entry_type,
  amount,
  reference_type,
  reference_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("general_ledger")
      .insert([
        {

          tenant_id,

          account_name,

          entry_type,

          amount,

          reference_type,

          reference_id,

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

      ledger_entry:
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
