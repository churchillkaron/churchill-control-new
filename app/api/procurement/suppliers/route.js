import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import createSupplierPrice from "@/lib/inventory/procurement/suppliers/capabilities/createSupplierPrice";

import getBestSupplierPrice from "@/lib/inventory/procurement/pricing/capabilities/getBestSupplierPrice";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";



export async function GET(req) {

  try {

    const {
      searchParams,
    } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId");

    const entityId =
      searchParams.get("entityId");

    if (!organizationId) {
      return NextResponse.json({
        success:false,
        error:"organizationId required",
        supplier_prices:[]
      });
    }

    let query =
      supabaseAdmin
        .from("supplier_prices")
        .select("*")
        .eq(
          "organization_id",
          organizationId
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
    } =
      await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success:true,
      supplier_prices:data || [],
      rows:data || []
    });

  } catch(error) {

    return NextResponse.json({
      success:false,
      error:error.message,
      supplier_prices:[],
      rows:[]
    });

  }

}

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

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
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const result =
      await createSupplierPrice(
        {
          ...body,
          organization_id:
            access.organizationId,
          entity_id:
            body.entity_id ||
            body.entityId,
        }
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

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

export async function PUT(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

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
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const result =
      await getBestSupplierPrice({

        organization_id:
          access.organizationId,

        entity_id:
          body.entity_id ||
          body.entityId,

        item_id:
          body.item_id ||
          body.itemId,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

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
