import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runBankReconciliation({
  organization_id,
}) {

  try {

    const {
      data: statements,
      error: statementError,
    } = await supabaseAdmin
      .from("bank_statements")
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .is(
        "matched",
        null
      );

    if (statementError) {
      throw statementError;
    }

    const results = [];

    for (const statement of statements || []) {

      const {
        data: ledger,
      } = await supabaseAdmin
        .from("bank_ledger")
        .select("*")
        .eq(
          "organization_id",
          organization_id
        )
        .eq(
          "amount",
          statement.amount
        )
        .eq(
          "direction",
          statement.direction
        )
        .maybeSingle();

      if (ledger) {

        await supabaseAdmin
          .from("bank_statements")
          .update({

            matched: true,

            matched_at:
              new Date().toISOString(),

            ledger_reference_id:
              ledger.id,
          })
          .eq(
            "id",
            statement.id
          );

        results.push({

          statement_id:
            statement.id,

          ledger_id:
            ledger.id,

          matched: true,
        });

      } else {

        results.push({

          statement_id:
            statement.id,

          matched: false,
        });
      }
    }

    return {

      success: true,

      reconciled:
        results,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
