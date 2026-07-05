export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {

    const { searchParams } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organizationId required",
        },
        {
          status: 400,
        }
      );
    }

    let query =
      supabaseAdmin
        .from("chart_of_accounts")
        .select("*")
        .eq(
          "organization_id",
          organizationId
        );

    if (entityId) {
      query =
        query.eq(
          "entity_id",
          entityId
        );
    }

    query =
      query.order(
        "account_code",
        {
          ascending: true,
        }
      );

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      accounts: data || [],
      rows: data || [],
    });

  } catch (error) {

    console.error(
      "chart-of-accounts GET",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Chart of accounts load failed",
      },
      {
        status: 500,
      }
    );

  }
}
