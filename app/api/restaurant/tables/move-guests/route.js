import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      sourceTableId,
      targetTableId,
      source_table_id,
      target_table_id,
      organizationId,
      organization_id,
      guestCount,
      guest_count,
    } = body || {};

    const sourceId = sourceTableId || source_table_id;
    const targetId = targetTableId || target_table_id;
    const orgId = organizationId || organization_id;
    const count = Number(guestCount || guest_count || 0);

    if (!sourceId) {
      return NextResponse.json({ error: "sourceTableId required" }, { status: 400 });
    }

    if (!targetId) {
      return NextResponse.json({ error: "targetTableId required" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const { data: sourceSession, error: sourceError } = await supabaseAdmin
      .from("restaurant_table_sessions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("table_id", sourceId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (sourceError) throw sourceError;

    const { data: targetSession, error: targetError } = await supabaseAdmin
      .from("restaurant_table_sessions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("table_id", targetId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (targetError) throw targetError;

    if (!sourceSession || !targetSession) {
      return NextResponse.json({ error: "Active table session not found" }, { status: 404 });
    }

    const moveCount = count > 0 ? count : Number(sourceSession.guest_count || sourceSession.guests || 0);

    const sourceGuests = Math.max(
      0,
      Number(sourceSession.guest_count || sourceSession.guests || 0) - moveCount
    );

    const targetGuests =
      Number(targetSession.guest_count || targetSession.guests || 0) + moveCount;

    const { error: sourceUpdateError } = await supabaseAdmin
      .from("restaurant_table_sessions")
      .update({ guest_count: sourceGuests })
      .eq("id", sourceSession.id);

    if (sourceUpdateError) throw sourceUpdateError;

    const { error: targetUpdateError } = await supabaseAdmin
      .from("restaurant_table_sessions")
      .update({ guest_count: targetGuests })
      .eq("id", targetSession.id);

    if (targetUpdateError) throw targetUpdateError;

    return NextResponse.json({
      ok: true,
      sourceSessionId: sourceSession.id,
      targetSessionId: targetSession.id,
      movedGuests: moveCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Move guests failed" },
      { status: 500 }
    );
  }
}
