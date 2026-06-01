import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
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

    const tenant_id =
      access.tenantId;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "recipe_prepared_items"
      )
      .insert([
        {

          tenant_id:
            tenant_id,

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
