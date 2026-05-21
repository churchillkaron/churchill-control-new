import { NextResponse } from "next/server";

import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabase

      .from("tenants")

      .select(`
        *,
        tenant_modules (
          id,
          module_key,
          enabled
        )
      `);

    if (error) {

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

    return NextResponse.json({

      success: true,

      tenants:
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
