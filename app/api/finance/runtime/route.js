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
      purchaseOrders,
      journalEntries,
      taxReports,
      accountingPeriods,
      lockExceptions,
    ] = await Promise.all([

      supabaseAdmin
        .from("purchase_orders")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

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
        .from("finance_tax_reports")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("accounting_periods")
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

      procureToPay:
        purchaseOrders.count || 0,

      accounting:
        journalEntries.count || 0,

      tax:
        taxReports.count || 0,

      close:
        accountingPeriods.count || 0,

      purchaseOrders:
        purchaseOrders.count || 0,

      journals:
        journalEntries.count || 0,

      taxReports:
        taxReports.count || 0,

      accountingPeriods:
        accountingPeriods.count || 0,

      lockExceptions:
        lockExceptions.count || 0,

      closeReadiness:
        (lockExceptions.count || 0) > 0
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
