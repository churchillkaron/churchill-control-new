import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

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

    const tenant_id =
      access.tenantId;

    const {
      data,
      error,
    } = await supabaseAdmin

      .from(
        "approval_requests"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenant_id
      )

      .eq(
        "type",
        "deployment"
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(1)

      .single();

    if (error) {

      return NextResponse.json({

        approved: false,

        error:
          error.message,

      });

    }

    return NextResponse.json({

      approved:
        data?.status ===
        "approved",

      request:
        data,

    });

  } catch (error) {

    return NextResponse.json(
      {

        approved: false,

        error:
          error.message,

      },
      {
        status: 500,
      }
    );

  }

}
