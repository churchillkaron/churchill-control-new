import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function text(value) {
  return String(value ?? "").trim();
}

function uuidOrNull(value) {
  const normalized = text(value);
  return normalized || null;
}

async function requireOperator(request) {
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get("organization_id") || url.searchParams.get("organizationId"));
  const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
  if (!access.success) return access;
  if (access.organizationId !== PLATFORM_ORGANIZATION_ID) {
    return { success: false, status: 404, error: "Avantiqo Platform owner workspace required" };
  }
  return access;
}

async function readBody(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, status: 400, error: "A JSON request body is required" };
  }
  return { success: true, body };
}

function errorStatus(error) {
  const message = text(error?.message);
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("CONFLICT") || message.includes("NOT_OPEN") || message.includes("TERMINAL_STAGE")) return 409;
  if (message.includes("REQUIRED")) return 400;
  return Number(error?.status || 500);
}

export async function GET(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

    const url = new URL(request.url);
    const acquisitionId = uuidOrNull(url.searchParams.get("acquisitionId") || url.searchParams.get("acquisition_id"));

    let query = supabaseAdmin
      .from("platform_acquisition_obligations")
      .select("id,acquisition_id,seller_organization_id,stage,title,due_at,status,schedule_note,completion_evidence_reference,completion_note,owner_staff_account_id,completed_by_staff_account_id,created_at,updated_at,completed_at")
      .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
      .order("created_at", { ascending: false })
      .limit(500);

    if (acquisitionId) query = query.eq("acquisition_id", acquisitionId);
    const { data, error } = await query;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const now = Date.now();
    const open = rows.filter((row) => row.status === "OPEN");
    const overdue = open.filter((row) => {
      const due = new Date(row.due_at).getTime();
      return Number.isFinite(due) && due <= now;
    });

    return Response.json({
      success: true,
      observedAt: new Date().toISOString(),
      obligations: rows,
      summary: { total: rows.length, open: open.length, overdue: overdue.length },
      authority: "AVANTIQO_PLATFORM_ACQUISITION_OWNER_OBLIGATIONS",
    });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_OBLIGATIONS_GET_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to read acquisition obligations" }, { status: errorStatus(error) });
  }
}

export async function POST(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

    const bodyResult = await readBody(request);
    if (!bodyResult.success) return Response.json({ success: false, error: bodyResult.error }, { status: bodyResult.status });
    const { body } = bodyResult;

    const acquisitionId = uuidOrNull(body.acquisitionId || body.acquisition_id);
    const expectedStage = text(body.expectedStage || body.expected_stage).toUpperCase();
    const title = text(body.title);
    const dueAt = text(body.dueAt || body.due_at);
    const scheduleNote = text(body.scheduleNote || body.schedule_note);
    const rescheduleReason = text(body.rescheduleReason || body.reschedule_reason) || null;
    if (!acquisitionId || !expectedStage || !title || !dueAt || !scheduleNote) {
      return Response.json({ success: false, error: "Acquisition, expected stage, next action, due time, and schedule note are required" }, { status: 400 });
    }
    if (!Number.isFinite(new Date(dueAt).getTime())) {
      return Response.json({ success: false, error: "A valid due time is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("platform_set_acquisition_obligation", {
      p_acquisition_id: acquisitionId,
      p_seller_organization_id: PLATFORM_ORGANIZATION_ID,
      p_expected_stage: expectedStage,
      p_title: title,
      p_due_at: new Date(dueAt).toISOString(),
      p_schedule_note: scheduleNote,
      p_owner_staff_account_id: access.staff.id,
      p_reschedule_reason: rescheduleReason,
    });
    if (error) throw error;

    return Response.json({ success: true, obligation: data, authority: "AVANTIQO_PLATFORM_ATOMIC_ACQUISITION_OWNER_OBLIGATION" }, { status: 201 });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_OBLIGATION_SET_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to schedule acquisition obligation" }, { status: errorStatus(error) });
  }
}

export async function PATCH(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

    const bodyResult = await readBody(request);
    if (!bodyResult.success) return Response.json({ success: false, error: bodyResult.error }, { status: bodyResult.status });
    const { body } = bodyResult;

    const obligationId = uuidOrNull(body.obligationId || body.obligation_id);
    const evidenceReference = text(body.evidenceReference || body.evidence_reference);
    const note = text(body.note);
    if (!obligationId || !evidenceReference || !note) {
      return Response.json({ success: false, error: "Obligation, completion evidence reference, and completion note are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("platform_complete_acquisition_obligation", {
      p_obligation_id: obligationId,
      p_seller_organization_id: PLATFORM_ORGANIZATION_ID,
      p_completion_evidence_reference: evidenceReference,
      p_completion_note: note,
      p_completed_by_staff_account_id: access.staff.id,
    });
    if (error) throw error;

    return Response.json({ success: true, obligation: data, authority: "AVANTIQO_PLATFORM_ATOMIC_ACQUISITION_OWNER_OBLIGATION_COMPLETION" });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_OBLIGATION_COMPLETE_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to complete acquisition obligation" }, { status: errorStatus(error) });
  }
}
