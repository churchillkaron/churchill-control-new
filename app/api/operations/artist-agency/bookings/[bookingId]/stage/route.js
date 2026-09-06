import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPABILITY_ID = "artist-agency.booking";
const RECORD_TYPE = "artist_booking";
const TRANSITIONS = Object.freeze({
  inquiry: new Set(["hold", "offer", "lost", "cancelled"]),
  hold: new Set(["inquiry", "offer", "lost", "cancelled"]),
  offer: new Set(["hold", "contract", "lost", "cancelled"]),
  contract: new Set(["offer", "confirmed", "lost", "cancelled"]),
  confirmed: new Set(["settled", "cancelled"]),
  settled: new Set(),
  lost: new Set(),
  cancelled: new Set(),
});
const EVIDENCE_REQUIRED_STAGES = new Set(["confirmed", "settled", "lost", "cancelled"]);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function resolveMembership(supabase, user, organizationId) {
  const authUserId = user?.id || user?.user_id || user?.auth_user_id;
  if (!authUserId || !organizationId) return null;

  const { data: staff } = await supabase
    .from("staff_accounts")
    .select("id,auth_user_id,active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .maybeSingle();
  if (!staff?.id) return null;

  const { data: membership } = await supabase
    .from("organization_users")
    .select("id,organization_id,role,status,staff_account_id")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staff.id)
    .eq("status", "active")
    .maybeSingle();
  return membership ? { staff, membership } : null;
}

function lifecycleCommand(currentRecordStatus, targetStage) {
  if (targetStage === "confirmed" && ["draft", "inactive"].includes(currentRecordStatus)) return "activate";
  if (["settled", "lost", "cancelled"].includes(targetStage) && ["draft", "active", "inactive"].includes(currentRecordStatus)) return "archive";
  return "update";
}

export async function POST(request, { params }) {
  try {
    const user = await requireAuth(request);
    const bookingId = cleanText(params?.bookingId, 80);
    const body = await request.json();
    const organizationId = cleanText(body.organization_id, 80);
    const targetStage = cleanText(body.to_stage, 30).toLowerCase();
    const evidence = cleanText(body.evidence, 1000);

    if (!bookingId || !organizationId || !targetStage) {
      return NextResponse.json({ error: "BOOKING_STAGE_INPUT_REQUIRED" }, { status: 400 });
    }

    const supabase = adminClient();
    const authority = await resolveMembership(supabase, user, organizationId);
    if (!authority) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const { data: booking, error: readError } = await supabase
      .from("operations_records")
      .select("id,organization_id,status,attributes,updated_at")
      .eq("id", bookingId)
      .eq("organization_id", organizationId)
      .eq("capability_id", CAPABILITY_ID)
      .eq("record_type", RECORD_TYPE)
      .maybeSingle();
    if (readError) throw readError;
    if (!booking) return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });

    const currentStage = cleanText(booking.attributes?.booking_stage || "inquiry", 30).toLowerCase();
    if (!TRANSITIONS[currentStage]?.has(targetStage)) {
      return NextResponse.json({ error: "INVALID_BOOKING_STAGE_TRANSITION", current_stage: currentStage, to_stage: targetStage }, { status: 409 });
    }

    if (EVIDENCE_REQUIRED_STAGES.has(targetStage) && !evidence) {
      return NextResponse.json({ error: "TRANSITION_EVIDENCE_REQUIRED", to_stage: targetStage }, { status: 400 });
    }

    const command = lifecycleCommand(String(booking.status || "draft").toLowerCase(), targetStage);
    const attributes = {
      ...(booking.attributes || {}),
      _operations_lifecycle: "master",
      booking_stage: targetStage,
      booking_stage_changed_at: new Date().toISOString(),
      booking_stage_changed_by: authority.staff.id,
      booking_stage_evidence: evidence || null,
      booking_stage_previous: currentStage,
    };

    const { data: updated, error: updateError } = await supabase
      .from("operations_records")
      .update({
        attributes,
        last_command: command,
        updated_by: authority.staff.id,
      })
      .eq("id", booking.id)
      .eq("organization_id", organizationId)
      .eq("updated_at", booking.updated_at)
      .select("id,code,name,status,scheduled_start,attributes,updated_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: "BOOKING_CHANGED_RELOAD_REQUIRED" }, { status: 409 });

    return NextResponse.json({ booking: updated, transition: { from: currentStage, to: targetStage, command } });
  } catch (error) {
    const message = error?.message || "BOOKING_STAGE_UPDATE_FAILED";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
