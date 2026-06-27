import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {

  const {
    searchParams,
  } = new URL(
    request.url
  );

  const access =
    await requireOrganizationAccess({

      organizationId:
        searchParams.get(
          "organizationId"
        ),

    });

  if (!access.success) {

    return NextResponse.json(
      {
        success: false,
        error:
          access.error,
      },
      {
        status:
          access.status,
      }
    );

  }

  const organizationId =
    access.organizationId;

  const {
    data: journals,
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
      "organization_id",
      organizationId
    )

    .order(
      "created_at",
      { ascending: false }
    )

    .limit(500);

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  const formatted =

    (journals || []).map(
      (journal) => ({

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

      })

    );

  return NextResponse.json({

    success: true,

    organizationId,

    count:
      formatted.length,

    journals:
      formatted,

  });

}
