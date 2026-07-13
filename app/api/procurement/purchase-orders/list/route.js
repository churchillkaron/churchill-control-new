import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId ||
          body.organization_id,

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

    const entityId =
      body.entityId ||
      body.entity_id ||
      null;

    let query = supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        parties (
          id,
          display_name
        )
      `)

      .eq(
        "organization_id",
        access.organizationId
      );

    if (entityId) {
      query =
        query.eq(
          "entity_id",
          entityId
        );
    }

    const {
      data,
      error,
    } = await query

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      orders:
        data || [],

    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
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



export async function GET(req) {

  try {

    const { searchParams } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access =
      await requireOrganizationAccess({
        organizationId,
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

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        parties (
          id,
          display_name
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", {
        ascending: false,
      });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      purchaseOrders: data || [],
      rows: data || [],
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
