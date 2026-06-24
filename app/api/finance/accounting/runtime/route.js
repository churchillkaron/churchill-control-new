import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {

    const body = await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId: body.organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const organizationId =
      body.organizationId;

    const [
      journals,
      lines,
      accounts,
    ] = await Promise.all([

      supabaseAdmin
        .from("journal_entries")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("journal_entry_lines")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("chart_of_accounts")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

    ]);

    return NextResponse.json({
      success: true,

      journals:
        journals.count || 0,

      journalLines:
        lines.count || 0,

      accounts:
        accounts.count || 0,

      reviewQueue:
        journals.count || 0,

      trialBalanceIssues: 0,

      reconciliationExceptions: 0,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
