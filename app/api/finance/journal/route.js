export const dynamic = "force-dynamic";
import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function GET(request) {

  const { searchParams } =
    new URL(request.url);

  const id =
    searchParams.get("id");

  if (!id) {

    return NextResponse.json({

      success: false,

      error:
        "Journal ID required",

    }, {

      status: 400,

    });

  }

  const {
    data: journal,
    error,
  } = await supabaseAdmin

    .from("journal_entries")

    .select(`
      *,
      journal_entry_lines (
        *,
        chart_of_accounts (
          id,
          account_code,
          account_name,
          account_category,
          account_type
        )
      )
    `)

    .eq(
      "id",
      id
    )

    .single();

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  const totalDebits =

    (journal.journal_entry_lines || [])
      .reduce(

        (sum, line) =>

          sum +

          Number(
            line.debit || 0
          ),

        0

      );

  const totalCredits =

    (journal.journal_entry_lines || [])
      .reduce(

        (sum, line) =>

          sum +

          Number(
            line.credit || 0
          ),

        0

      );

  const balanced =

    Math.abs(
      totalDebits -
      totalCredits
    ) < 0.01;

  return NextResponse.json({

    success: true,

    balanced,

    totals: {

      debits:
        totalDebits,

      credits:
        totalCredits,

    },

    journal: {

      id:
        journal.id,

      journal_number:
        journal.journal_number,

      posting_date:
        journal.posting_date,

      document_date:
        journal.document_date,

      reference:
        journal.reference,

      organization_id:
        journal.organization_id,

      entity_id:
        journal.entity_id,

      description:
        journal.description,

      source_type:
        journal.source_type,

      source_id:
        journal.source_id,

      status:
        journal.status,

      created_by:
        journal.created_by,

      created_at:
        journal.created_at,

      lines:

        (journal.journal_entry_lines || [])
          .map((line) => ({

            id:
              line.id,

            debit:
              Number(
                line.debit || 0
              ),

            credit:
              Number(
                line.credit || 0
              ),

            description:
              line.description,

            account: {

              id:
                line.chart_of_accounts?.id,

              code:
                line.chart_of_accounts?.account_code,

              name:
                line.chart_of_accounts?.account_name,

              category:
                line.chart_of_accounts?.account_category,

            },

          })),

    },

  });

}
