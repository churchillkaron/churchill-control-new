import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const {
      data,
      error,
    } = await supabase
      .from("tax_filings")
      .select("*")
      .eq(
        "tenant_id",
        body.tenantId
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
      filings: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
