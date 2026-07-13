import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {

  try {
    const {
      searchParams,
    } =
      new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    let query =
      supabaseAdmin
      .from(
        "recipe_prepared_items"
      )
      .select(`
        id,
        dish_id,
        prepared_item_name,
        quantity_required,
        unit,
        created_at
      `)
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (organizationId) {
      query =
        query.eq(
          "organization_id",
          organizationId
        );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      components:
        data || [],
    });

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

    const organization_id =
      access.organizationId;

    const entity_id =
      body.entity_id ||
      body.entityId ||
      null;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "recipe_prepared_items"
      )
      .insert([
        {

          organization_id:
            organization_id,

          entity_id:
            entity_id,

          dish_id:
            body.dish_id,

          prepared_item_name:
            body.prepared_item_name,

          quantity_required:
            body.quantity_required,

          unit:
            body.unit,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      component:
        data,
    });

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
