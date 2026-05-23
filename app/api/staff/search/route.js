import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function GET(req) {

  try {

    const identity =
      await getStaffIdentity(req);

    if (!identity) {

      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );

    }

    const {
      searchParams,
    } = new URL(req.url);

    const query =
      searchParams.get(
        "query"
      ) || "";

    const supabase =
      createServerSupabase();

    let request =
      supabase

        .from(
          "staff_accounts"
        )

        .select(`
          id,
          name,
          role,
          profile_picture,
          email
        `)

        .eq(
          "tenant_id",
          identity.tenant_id
        )

        .neq(
          "id",
          identity.id
        )

        .limit(20);

    if (
      query
    ) {

      request =
        request.or(
          `name.ilike.%${query}%,email.ilike.%${query}%`
        );

    }

    const {
      data,
      error,
    } = await request;

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
