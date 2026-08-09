import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function POST(req) {
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

    const supabase =
      createServerSupabase();

    const { error } = await supabase
      .from("staff_online_status")
      .upsert(
        {
          staff_id: identity.id,
          organization_id:
            identity.organization_id,
          online: true,
          last_seen:
            new Date().toISOString(),
        },
        {
          onConflict: "staff_id",
        }
      );

    if (error) {
      throw error;
    }

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

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase
      .from("staff_online_status")
      .select(`
        *,
        staff:staff_accounts(
          id,
          name
        )
      `)
      .eq(
        "organization_id",
        identity.organization_id
      )
      .eq("online", true);

    if (error) {
      throw error;
    }

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
