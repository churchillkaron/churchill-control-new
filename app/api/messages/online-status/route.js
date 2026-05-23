import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function POST() {

  try {

    const identity =
      await getStaffIdentity();

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

    const supabase =
      createServerSupabase();

    await supabase

      .from(
        "staff_online_status"
      )

      .upsert(
        {
          staff_id:
            identity.id,

          tenant_id:
            identity.tenant_id,

          online: true,

          last_seen:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "staff_id",
        }
      );

    return NextResponse.json({
      success: true,
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

export async function GET() {

  try {

    const identity =
      await getStaffIdentity();

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

    const supabase =
      createServerSupabase();

    const {
      data,
    } = await supabase

      .from(
        "staff_online_status"
      )

      .select(`
        *,
        staff:staff_accounts(
          id,
          name
        )
      `)

      .eq(
        "tenant_id",
        identity.tenant_id
      )

      .eq(
        "online",
        true
      );

    return NextResponse.json({
      success: true,
      online:
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
