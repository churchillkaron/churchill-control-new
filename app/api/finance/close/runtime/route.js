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
      accountingPeriods,
      financialPeriods,
      lockExceptions,
    ] = await Promise.all([

      supabaseAdmin
        .from("accounting_periods")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseAdmin
        .from("financial_periods")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseAdmin
        .from("period_lock_exceptions")
        .select("*", {
          count: "exact",
          head: true,
        }),

    ]);

    return NextResponse.json({
      success: true,

      accountingPeriods:
        accountingPeriods.count || 0,

      financialPeriods:
        financialPeriods.count || 0,

      lockExceptions:
        lockExceptions.count || 0,

      closeReadiness:
        lockExceptions.count > 0
          ? "ATTENTION"
          : "READY",
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
