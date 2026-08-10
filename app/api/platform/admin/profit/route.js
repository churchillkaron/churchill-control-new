import { NextResponse } from "next/server";

import { calculateOrganizationProfit } from "@/lib/billing/profitEngine";
import { optimizeSaaSBusiness } from "@/lib/billing/optimizationEngine";
import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {
  try {
    const access = await requirePlatformAdminAccess();

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { data: organizations, error } = await supabaseAdmin
      .from("organizations")
      .select("id,name,organization_type");

    if (error) throw error;

    const results = [];

    for (const organization of organizations || []) {
      const profit = await calculateOrganizationProfit(organization.id);

      if (profit) {
        results.push({
          organizationId: organization.id,
          organizationName: organization.name,
          organizationType: organization.organization_type,
          ...profit,
        });
      }
    }

    const totalRevenue = results.reduce(
      (sum, row) => sum + Number(row.revenue || 0),
      0,
    );

    const totalCost = results.reduce(
      (sum, row) => sum + Number(row.aiCost || 0),
      0,
    );

    const totalProfit = totalRevenue - totalCost;
    const optimization = optimizeSaaSBusiness({ organizations: results });

    return NextResponse.json({
      success: true,
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      },
      organizations: results,
      optimization,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to calculate platform profit",
      },
      { status: 500 },
    );
  }
}
