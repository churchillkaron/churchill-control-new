export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const organizationId =
    searchParams.get("organizationId") ||
    searchParams.get("organization_id");

  const { data, error } = await supabaseAdmin
    .from("customer_loyalty_accounts")
    .select("*")
    .eq("organization_id", organizationId);

  return NextResponse.json({
    success: !error,
    organizationIdReceived: organizationId,
    rowCount: data?.length || 0,
    rows: data || [],
    error,
  });
}
