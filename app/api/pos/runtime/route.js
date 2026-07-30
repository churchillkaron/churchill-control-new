export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import defaultPOSSettings from "@/lib/settings/defaultPOSSettings";
import { resolvePOSFinancialPolicy } from "@/lib/pos/runtime/resolvePOSFinancialPolicy";

async function safeQuery(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const [zones, tables, dishes, settingsResult, organizationResult, policy] =
      await Promise.all([
        safeQuery(
          supabaseAdmin
            .from("restaurant_zones")
            .select("*")
            .eq("organization_id", organizationId)
            .order("sort_order")
        ),
        safeQuery(
          supabaseAdmin
            .from("restaurant_tables")
            .select("*")
            .eq("organization_id", organizationId)
            .order("table_number")
        ),
        safeQuery(
          supabaseAdmin
            .from("dishes")
            .select("*")
            .eq("organization_id", organizationId)
            .order("name")
        ),
        supabaseAdmin
          .from("operational_settings")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("domain", "POS")
          .maybeSingle(),
        supabaseAdmin
          .from("organizations")
          .select("id,name,currency,currency_code")
          .eq("id", organizationId)
          .maybeSingle(),
        resolvePOSFinancialPolicy({ organizationId }),
      ]);

    if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
      throw settingsResult.error;
    }

    if (organizationResult.error && organizationResult.error.code !== "PGRST116") {
      throw organizationResult.error;
    }

    const storedSettings =
      settingsResult.data?.settings &&
      typeof settingsResult.data.settings === "object"
        ? settingsResult.data.settings
        : {};

    return NextResponse.json({
      success: true,
      organization: organizationResult.data || { id: organizationId },
      zones,
      tables,
      dishes,
      posSettings: {
        ...defaultPOSSettings,
        ...storedSettings,
      },
      financialPolicy: policy,
      access: access.access,
    });
  } catch (error) {
    console.error("POS RUNTIME ERROR", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
