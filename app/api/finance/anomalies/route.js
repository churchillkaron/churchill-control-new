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

  const tenantId =
    access.tenantId;

  const anomalies = [];

  const {
    data: journals,
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
      "tenant_id",
      tenantId
    )

    .order(
      "created_at",
      { ascending: false }
    )

    .limit(500);

  for (const journal of journals || []) {

    let debits = 0;

    let credits = 0;

    for (
      const line of
      journal.journal_entry_lines || []
    ) {

      debits +=
        Number(
          line.debit || 0
        );

      credits +=
        Number(
          line.credit || 0
        );

    }

    // -----------------------------------
    // UNBALANCED JOURNAL
    // -----------------------------------

    if (

      Math.abs(
        debits - credits
      ) > 0.01

    ) {

      anomalies.push({

        severity:
          "critical",

        type:
          "UNBALANCED_JOURNAL",

        journal_id:
          journal.id,

        entry_number:
          journal.entry_number,

        description:
          journal.description,

        message:
          `Journal imbalance detected: ${debits} vs ${credits}`,

      });

    }

    // -----------------------------------
    // LARGE JOURNAL
    // -----------------------------------

    if (

      debits > 100000

    ) {

      anomalies.push({

        severity:
          "warning",

        type:
          "LARGE_TRANSACTION",

        journal_id:
          journal.id,

        entry_number:
          journal.entry_number,

        description:
          journal.description,

        message:
          `Large transaction detected: ${debits}`,

      });

    }

    // -----------------------------------
    // MISSING SOURCE
    // -----------------------------------

    if (
      !journal.source_type
    ) {

      anomalies.push({

        severity:
          "warning",

        type:
          "MISSING_SOURCE",

        journal_id:
          journal.id,

        entry_number:
          journal.entry_number,

        description:
          journal.description,

        message:
          "Journal missing source traceability",

      });

    }

  }

  return NextResponse.json({

    success: true,

    tenantId,

    count:
      anomalies.length,

    anomalies,

  });

}
