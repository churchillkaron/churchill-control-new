import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function importBankStatement({
  organization_id,
  transactions = [],
}) {

  try {

    const rows =
      transactions.map(
        (
          transaction
        ) => ({

          organization_id,

          transaction_date:
            transaction.transaction_date,

          description:
            transaction.description,

          amount:
            transaction.amount,

          direction:
            transaction.direction,

          reference_number:
            transaction.reference_number,

          created_at:
            new Date().toISOString(),
        })
      );

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("bank_statements")
      .insert(rows)
      .select();

    if (error) {
      throw error;
    }

    return {

      success: true,

      imported:
        data?.length || 0,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
