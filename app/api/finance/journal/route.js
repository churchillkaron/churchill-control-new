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
          code,
          name,
          category
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

      entry_number:
        journal.entry_number,

      entry_date:
        journal.entry_date,

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
                line.chart_of_accounts?.code,

              name:
                line.chart_of_accounts?.name,

              category:
                line.chart_of_accounts?.category,

            },

          })),

    },

  });

}
