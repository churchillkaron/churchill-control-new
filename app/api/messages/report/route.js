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
    const messageId = body?.message_id || null;
    const reason = body?.reason || "";

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "message_id required" },
        { status: 400 }
      );
    }

    const { data: message, error: messageError } = await supabaseAdmin
      .from("messages")
      .select("id,thread_id")
      .eq("id", messageId)
      .eq("organization_id", identity.organization_id)
      .maybeSingle();

    if (messageError) {
      throw messageError;
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message not found" },
        { status: 404 }
      );
    }

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("message_participants")
      .select("id")
      .eq("organization_id", identity.organization_id)
      .eq("thread_id", message.thread_id)
      .eq("staff_id", identity.id)
      .maybeSingle();

    if (participantError) {
      throw participantError;
    }

    if (!participant) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("message_reports")
      .insert({
        organization_id: identity.organization_id,
        message_id: messageId,
        reported_by: identity.id,
        reason,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      report: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to report message",
      },
      { status: 500 }
    );
  }
}
