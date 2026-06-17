import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const industryId =
      searchParams.get("industryId");

    if (!industryId) {
      return NextResponse.json({
        success: false,
        error: "Missing industryId",
      });
    }

    const supabase =
      createServerSupabase();

    const {
      data: industryOrganizations,
      error,
    } = await supabase
      .from("organization_industries")
      .select("*")
      .eq("industry_id", industryId)
      .eq("status", "ACTIVE");

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      });
    }

    const organizationIds =
      (industryOrganizations || [])
        .map(
          item => item.organization_id
        );

    if (
      organizationIds.length === 0
    ) {
      return NextResponse.json({
        success: true,
        organizations: [],
      });
    }

    const {
      data: organizations,
      error: orgError,
    } = await supabase
      .from("organizations")
      .select("*")
      .in(
        "id",
        organizationIds
      );

    if (orgError) {
      return NextResponse.json({
        success: false,
        error: orgError.message,
      });
    }

    return NextResponse.json({
      success: true,
      organizations:
        organizations || [],
    });

  } catch (error) {

    return NextResponse.json({
      success: false,
      error: error.message,
    });

  }
}
