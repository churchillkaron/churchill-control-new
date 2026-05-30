export const dynamic = "force-dynamic";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

  try {

    const body =
      req?.method === "GET"
        ? {}

        : await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return Response?.json
        ? Response.json(
            {
              success: false,
              error:
                access.error,
            },
            {
              status:
                access.status,
            }
          )

        : NextResponse.json(
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

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase

      .from("control_logs")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    return Response.json({

      success: true,

      data,

    });

  } catch (error) {

    console.error(error);

    return Response.json(

      {
        success: false,
        error:
          error.message,
      },

      {
        status: 500,
      }

    );

  }

}
