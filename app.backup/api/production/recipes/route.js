import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("recipe_items")
      .select(`
        id,
        dish_id,
        quantity_required,
        ingredients (
          id,
          name,
          unit,
          cost
        )
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

      recipes:
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

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("recipe_items")
      .insert([
        {

          tenant_id:
            body.tenant_id,

          dish_id:
            body.dish_id,

          ingredient_id:
            body.ingredient_id,

          quantity_required:
            body.quantity_required,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      recipe:
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
