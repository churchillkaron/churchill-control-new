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
    await requireAuth();

    const {
      searchParams,
    } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access =
      await requireOrganizationAccess({
        organizationId,
        request: req,
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
      .from("recipe_prepared_items")
      .select(`
        id,
        dish_id,
        prepared_item_name,
        quantity_required,
        unit,
        created_at
      `)
      .eq(
        "organization_id",
        access.organizationId
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

    return NextResponse.json({
      success: true,
      components: data || [],
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
        request: req,
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
      .from("recipe_prepared_items")
      .insert([
        {
          organization_id:
            access.organizationId,

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
      component: data,
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
