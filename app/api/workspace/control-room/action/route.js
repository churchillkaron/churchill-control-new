import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * CONTROL ROOM ACTION EXECUTOR
 * Human-in-the-loop override system
 */

export async function POST(req) {
  try {
    const {
      approvalId,
      action,
      organizationId,
      payload,
    } = await req.json();

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // =========================
    // APPROVE ACTION
    // =========================
    if (action === "approve") {
      await supabaseAdmin
        .from("ai_approval_queue")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", approvalId);

      return NextResponse.json({
        success: true,
        message: "Action approved",
      });
    }

    // =========================
    // REJECT ACTION
    // =========================
    if (action === "reject") {
      await supabaseAdmin
        .from("ai_approval_queue")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
        })
        .eq("id", approvalId);

      return NextResponse.json({
        success: true,
        message: "Action rejected",
      });
    }

    // =========================
    // FORCE EXECUTE (ADMIN OVERRIDE)
    // =========================
    if (action === "execute") {
      await supabaseAdmin
        .from("system_events")
        .insert({
          organization_id: organizationId,
          type: "MANUAL_EXECUTION",
          payload,
          created_at: new Date().toISOString(),
        });

      return NextResponse.json({
        success: true,
        message: "Action executed manually",
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );

  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
