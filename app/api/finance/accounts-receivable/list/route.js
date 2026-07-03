export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId"),
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const organizationId = access.organizationId;

    const { data, error } = await supabaseAdmin
      .from("accounts_receivable")
      .select("*")
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      receivables: data || [],
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
