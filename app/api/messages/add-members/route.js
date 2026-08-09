import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export async function POST(request) {
  try {
    const identity = await getStaffIdentity(request);

    if (!identity?.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const threadId = body?.thread_id || null;
    const participantIds = Array.isArray(body?.participant_ids)
      ? [...new Set(body.participant_ids.filter(Boolean))]
      : [];

    if (!threadId || !participantIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "thread_id and participant_ids required",
        },
        { status: 400 }
      );
    }

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from("message_participants")
      .select("id")
      .eq("organization_id", identity.organization_id)
      .eq("thread_id", threadId)
      .eq("staff_id", identity.id)
      .maybeSingle();

    if (requesterError) {
      throw requesterError;
    }

    if (!requester) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { data: validStaff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id")
      .eq("active_organization_id", identity.organization_id)
      .eq("active", true)
      .in("id", participantIds);

    if (staffError) {
      throw staffError;
    }

    if ((validStaff || []).length !== participantIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more staff members are not active in this organization",
        },
        { status: 400 }
      );
    }

    const rows = participantIds.map((staffId) => ({
      organization_id: identity.organization_id,
      thread_id: threadId,
      staff_id: staffId,
    }));

    const { error } = await supabaseAdmin
      .from("message_participants")
      .upsert(rows, {
        onConflict: "thread_id,staff_id",
      });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to add thread members",
      },
      { status: 500 }
    );
  }
}
