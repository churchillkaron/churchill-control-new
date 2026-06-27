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

  const report = {

    balancedTrialBalance: false,

    totalDebits: 0,

    totalCredits: 0,

    journalCount: 0,

    orphanedJournals: 0,

    unbalancedJournals: 0,

    missingSources: 0,

    duplicateEntries: 0,

    retainedEarningsPresent: false,

    incomeSummaryPresent: false,

    healthScore: 100,

    issues: [],

  };

  // -----------------------------------
  // LOAD JOURNALS
  // -----------------------------------

  const {
    data: journals,
  } = await supabaseAdmin

    .from("journal_entries")

    .select(`
      *,
      journal_entry_lines (
        *
      )
    `)

    .eq(
      "organization_id",
      organizationId
    )

    .limit(5000);

  report.journalCount =
    journals?.length || 0;

  const seen =
    new Set();

  for (
    const journal of journals || []
  ) {

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

    report.totalDebits +=
      debits;

    report.totalCredits +=
      credits;

    // -----------------------------
    // UNBALANCED
    // -----------------------------

    if (

      Math.abs(
        debits - credits
      ) > 0.01

    ) {

      report.unbalancedJournals++;

      report.healthScore -= 15;

      report.issues.push({

        type:
          "UNBALANCED_JOURNAL",

        entry:
          journal.entry_number,

      });

    }

    // -----------------------------
    // MISSING SOURCE
    // -----------------------------

    if (
      !journal.source_type
    ) {

      report.missingSources++;

      report.healthScore -= 5;

    }

    // -----------------------------
    // DUPLICATES
    // -----------------------------

    const key =

      `${journal.entry_number}-${journal.description}`;

    if (
      seen.has(key)
    ) {

      report.duplicateEntries++;

      report.healthScore -= 10;

    }

    seen.add(key);

  }

  // -----------------------------------
  // TRIAL BALANCE
  // -----------------------------------

  report.balancedTrialBalance =

    Math.abs(

      report.totalDebits -

      report.totalCredits

    ) < 0.01;

  if (
    !report.balancedTrialBalance
  ) {

    report.healthScore -= 25;

  }

  // -----------------------------------
  // ACCOUNT CHECKS
  // -----------------------------------

  const {
    data: accounts,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*")

    .eq(
      "organization_id",
      organizationId
    );

  report.retainedEarningsPresent =

    (accounts || []).some(

      (a) =>

        a.code === "3100"

    );

  report.incomeSummaryPresent =

    (accounts || []).some(

      (a) =>

        a.code === "3900"

    );

  if (
    !report.retainedEarningsPresent
  ) {

    report.healthScore -= 20;

  }

  if (
    !report.incomeSummaryPresent
  ) {

    report.healthScore -= 10;

  }

  // -----------------------------------
  // LIMIT SCORE
  // -----------------------------------

  if (
    report.healthScore < 0
  ) {

    report.healthScore = 0;

  }

  return NextResponse.json({

    success: true,

    organizationId,

    report,

  });

}
