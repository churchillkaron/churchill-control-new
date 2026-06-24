import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    await requireAuth();

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

    const { data, error } =
      await supabaseAdmin
        .from("accounts_receivable")
        .select("*")
        .eq(
          "organization_id",
          body.organizationId
        )
        .order(
          "due_date",
          {
            ascending: true,
          }
        );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      receivables: data || [],
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
