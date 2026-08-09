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
    const targetStaffId = body?.target_staff_id || null;

    if (!targetStaffId) {
      return NextResponse.json(
        { success: false, error: "target_staff_id required" },
        { status: 400 }
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,name")
      .eq("id", targetStaffId)
      .eq("active_organization_id", identity.organization_id)
      .eq("active", true)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Staff not found in this organization" },
        { status: 404 }
      );
    }

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("message_threads")
      .insert({
        organization_id: identity.organization_id,
        created_by: identity.id,
        title: target.name,
        type: "private",
      })
      .select("*")
      .single();

    if (threadError) {
      throw threadError;
    }

    const { error: participantError } = await supabaseAdmin
      .from("message_participants")
      .insert([
        {
          organization_id: identity.organization_id,
          thread_id: thread.id,
          staff_id: identity.id,
        },
        {
          organization_id: identity.organization_id,
          thread_id: thread.id,
          staff_id: target.id,
        },
      ]);

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
        error: error?.message || "Unable to create private thread",
      },
      { status: 500 }
    );
  }
}
