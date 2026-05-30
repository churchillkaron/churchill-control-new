import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function GET(request) {

  const { searchParams } =
    new URL(request.url);

  const sourceType =
    searchParams.get(
      "source_type"
    );

  const sourceId =
    searchParams.get(
      "source_id"
    );

  if (
    !sourceType ||
    !sourceId
  ) {

    return NextResponse.json({

      success: false,

      error:
        "source_type and source_id required",

    }, {

      status: 400,

    });

  }

  const {
    data,
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
      "source_type",
      sourceType
    )

    .eq(
      "source_id",
      sourceId
    )

    .order(
      "created_at",
      { ascending: true }
    );

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  const chain =

    (data || []).map(
      (journal) => ({

        id:
          journal.id,

        entry_number:
          journal.entry_number,

        entry_date:
          journal.entry_date,

        description:
          journal.description,

        status:
          journal.status,

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

              account: {

                code:
                  line.chart_of_accounts?.code,

                name:
                  line.chart_of_accounts?.name,

                category:
                  line.chart_of_accounts?.category,

              },

            })),

      })

    );

  return NextResponse.json({

    success: true,

    source_type:
      sourceType,

    source_id:
      sourceId,

    count:
      chain.length,

    chain,

  });

}
