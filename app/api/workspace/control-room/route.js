import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runCommandCenterWatch } from "@/lib/ai/runCommandCenterWatch";
import { selfHealingEngine } from "@/lib/ai/selfHealingEngine";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "Missing organizationId" },
        { status: 400 }
      );
    }

    const { data: events } = await supabaseAdmin
      .from("system_events")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: approvals } = await supabaseAdmin
      .from("ai_approval_queue")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    const commandCenter = await runCommandCenterWatch({ organizationId });

    const selfHealing = selfHealingEngine({
      metrics: {},
      events: commandCenter?.alerts || [],
      alerts: [],
    });

    const healthScore = selfHealing?.healthScore ?? 100;

    return NextResponse.json({
      success: true,
      healthScore,

      events: events || [],
      approvals: approvals || [],

      commandCenter,
      selfHealing,

      status:
        healthScore > 80
          ? "healthy"
          : healthScore > 50
          ? "warning"
          : "critical",
    });

  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
