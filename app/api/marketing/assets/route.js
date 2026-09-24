export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/shared/supabase/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const supabase = createServerSupabase();

export async function GET(request) {

  try {

    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 });

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });

    const {
      data,
      error,
    } = await supabase

      .from(
        "creative_assets"
      )

      .select("*")

      .eq("organization_id", access.organizationId)

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(200);

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      assets:
        data || [],

    });

  } catch (err) {

    console.error(
      "LOAD MARKETING ASSETS ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          "Unable to load creative assets",

      },

      {
        status: 500,
      }

    );

  }

}