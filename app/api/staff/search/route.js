import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function GET(req) {

  try {

    const identity =
      await getStaffIdentity(
        req
      );

    if (!identity) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      searchParams,
    } = new URL(req.url);

    const query =
      searchParams.get(
        "query"
      ) || "";

    const {
      data,
      error,
    } = await supabase

      .from(
        "staff_accounts"
      )

      .select(`
        id,
        name,
        role,
        email,
        profile_picture
      `)

      .eq(
        "tenant_id",
        identity.tenant_id
      )

      .or(`
        name.ilike.%${query}%,
        role.ilike.%${query}%,
        email.ilike.%${query}%
      `)

      .limit(20);

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
      staff:
        data || [],
    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );

  }

}
