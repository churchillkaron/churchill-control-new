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
    const title = String(body?.title || "").trim();
    const participantIds = Array.isArray(body?.participant_ids)
      ? body.participant_ids.filter(Boolean)
      : [];

    if (!title || participantIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "title and participant_ids required",
        },
        { status: 400 }
      );
    }

    const allParticipantIds = [
      ...new Set([identity.id, ...participantIds]),
    ];

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id")
      .eq("active_organization_id", identity.organization_id)
      .eq("active", true)
      .in("id", allParticipantIds);

    if (staffError) {
      throw staffError;
    }

    if ((staffRows || []).length !== allParticipantIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more participants are not active in this organization",
        },
        { status: 400 }
      );
    }

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("message_threads")
      .insert({
        organization_id: identity.organization_id,
        created_by: identity.id,
        title,
        type: "group",
      })
      .select("*")
      .single();

    if (threadError) {
      throw threadError;
    }

    const participantRows = allParticipantIds.map((staffId) => ({
      organization_id: identity.organization_id,
      thread_id: thread.id,
      staff_id: staffId,
    }));

    const { error: participantError } = await supabaseAdmin
      .from("message_participants")
      .insert(participantRows);

    if (participantError) {
      await supabaseAdmin
        .from("message_threads")
        .delete()
        .eq("id", thread.id)
        .eq("organization_id", identity.organization_id);

      throw participantError;
    }

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      thread,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to create group thread",
      },
      { status: 500 }
    );
  }
}
