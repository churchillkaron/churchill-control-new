export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      periodId,
      status,
      userId,
    } = body;

    if (!periodId || !status) {
      return NextResponse.json(
        { success: false, error: "Missing periodId or status" },
        { status: 400 }
      );
    }

    const allowedStatuses = [
      "open",
      "soft_closed",
      "closed",
      "locked",
    ];

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid period status" },
        { status: 400 }
      );
    }

    await checkFinancePermission({
      userId: userId || "system",
      permissionKey: "close_period",
    });

    const access =
      await requireOrganizationAccess({

        organizationId,

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

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("accounting_periods")
      .select("*")
      .eq("id", periodId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (existing.status === "locked") {
      return NextResponse.json(
        { success: false, error: "Locked accounting period cannot be changed" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("accounting_periods")
      .update({
        tenant_id: tenantId,
        status,
        closed_at:
          status === "closed" || status === "locked"
            ? new Date().toISOString()
            : null,
        closed_by:
          status === "closed" || status === "locked"
            ? userId || "system"
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", periodId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      period: data,
    });
  } catch (err) {
    console.error("PERIOD STATUS ERROR:", err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}