import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PLATFORM_TIME_ZONE_OFFSET = "+07:00";

function text(value) {
  return String(value ?? "").trim();
}

function platformOwnerDueAt(value) {
  const raw = text(value);
  if (!raw) return null;
  const hasExplicitZone = /(?:z|[+-]\d{2}:\d{2})$/i.test(raw);
  const normalized = hasExplicitZone
    ? raw
    : `${raw}${/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? ":00" : ""}${PLATFORM_TIME_ZONE_OFFSET}`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function requireOperator(request) {
  const url = new URL(request.url);
  const organizationId = text(
    url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
  );
  const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
  if (!access.success) return access;
  if (access.organizationId !== PLATFORM_ORGANIZATION_ID) {
    return { success: false, status: 404, error: "Avantiqo Platform owner workspace required" };
  }
  if (!access.staff?.id) {
    return { success: false, status: 403, error: "Authenticated platform owner identity is required" };
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

function rpcErrorStatus(error) {
  const message = text(error?.message);
  if (message.includes("ALREADY_CLAIMED")) return 409;
  if (message.includes("IDENTITY_INCOMPLETE")) return 409;
  if (message.includes("LEAD_NOT_FOUND")) return 404;
  if (message.includes("ACQUISITION_") && message.includes("REQUIRED")) return 400;
  return Number(error?.status || 500);
}

export async function GET(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    const observedAt = new Date();
    const [{ data: leads, error: leadsError }, { data: claimed, error: claimedError }] = await Promise.all([
      supabaseAdmin
        .from("organization_leads")
        .select("id,status,organization_id,email,company,contact,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("platform_acquisition_records")
        .select("lead_id")
        .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
        .not("lead_id", "is", null),
    ]);

    if (leadsError) throw leadsError;
    if (claimedError) throw claimedError;

    const claimedLeadIds = new Set((Array.isArray(claimed) ? claimed : []).map((row) => row.lead_id).filter(Boolean));
    const inboundEvidence = (Array.isArray(leads) ? leads : [])
      .filter((lead) => !claimedLeadIds.has(lead.id))
      .map((lead) => {
        const missingIdentity = [
          !text(lead.company) ? "company" : null,
          !text(lead.contact) ? "contact" : null,
          !text(lead.email) ? "email" : null,
        ].filter(Boolean);
        return {
          id: lead.id,
          status: lead.status || null,
          organizationId: lead.organization_id || null,
          company: lead.company || null,
          contact: lead.contact || null,
          email: lead.email || null,
          createdAt: lead.created_at || null,
          claimable: missingIdentity.length === 0,
          missingIdentity,
        };
      });

    return Response.json({
      success: true,
      observedAt: observedAt.toISOString(),
      inboundEvidence,
      summary: {
        unclaimed: inboundEvidence.length,
        claimable: inboundEvidence.filter((lead) => lead.claimable).length,
        incompleteIdentity: inboundEvidence.filter((lead) => !lead.claimable).length,
      },
      authority: "AVANTIQO_PLATFORM_INBOUND_EVIDENCE_TRIAGE",
    });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_INBOUND_GET_ERROR", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to read inbound acquisition evidence" },
      { status: rpcErrorStatus(error) },
    );
  }
}

export async function POST(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    const bodyResult = await readBody(request);
    if (!bodyResult.success) {
      return Response.json({ success: false, error: bodyResult.error }, { status: bodyResult.status });
    }

    const { body } = bodyResult;
    const leadId = text(body.leadId || body.lead_id);
    const claimNote = text(body.claimNote || body.claim_note);
    const nextScheduleNote = text(body.nextScheduleNote || body.next_schedule_note);
    const nextDueAt = platformOwnerDueAt(body.nextDueAt || body.next_due_at);

    if (!leadId) return Response.json({ success: false, error: "Inbound lead is required" }, { status: 400 });
    if (!claimNote) return Response.json({ success: false, error: "Claim rationale is required" }, { status: 400 });
    if (!nextDueAt) return Response.json({ success: false, error: "Next owner obligation due date must be valid" }, { status: 400 });
    if (new Date(nextDueAt).getTime() <= Date.now()) {
      return Response.json({ success: false, error: "Next owner obligation due date must be a future time" }, { status: 400 });
    }
    if (!nextScheduleNote) {
      return Response.json({ success: false, error: "Next owner obligation timing note is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("platform_claim_inbound_lead_v1", {
      p_seller_organization_id: PLATFORM_ORGANIZATION_ID,
      p_lead_id: leadId,
      p_claim_note: claimNote,
      p_next_due_at: nextDueAt,
      p_next_schedule_note: nextScheduleNote,
      p_owner_staff_account_id: access.staff.id,
    });
    if (error) throw error;

    return Response.json({
      success: true,
      acquisition: data,
      authority: "AVANTIQO_PLATFORM_INBOUND_LEAD_CLAIM_V1",
    }, { status: 201 });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_INBOUND_CLAIM_ERROR", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to claim inbound evidence" },
      { status: rpcErrorStatus(error) },
    );
  }
}
