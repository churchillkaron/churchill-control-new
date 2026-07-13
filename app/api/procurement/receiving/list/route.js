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
      .from("goods_receipts")
      .select(`
        *,
        parties (
          id,
          display_name
        ),
        purchase_orders (
          id,
          po_number,
          status
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
        "received_date",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      receipts:
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
      .from("goods_receipts")
      .select(`
        *,
        parties (
          id,
          display_name
        ),
        purchase_orders (
          id,
          po_number,
          status
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("received_date", {
        ascending: false,
      });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      receipts: data || [],
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
