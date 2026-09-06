import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const TERMINAL_STAGES = new Set(["FIRST_VALUE", "LOST"]);

function text(value) {
  return String(value ?? "").trim();
}

function uuidOrNull(value) {
  const normalized = text(value);
  return normalized || null;
}

function executionStateFilter(state) {
  return `execution_status.eq.${state},and(execution_status.is.null,status.eq.${state})`;
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

function requireNextObligation(body) {
  const nextDueAt = text(body.nextDueAt || body.next_due_at);
  const nextScheduleNote = text(body.nextScheduleNote || body.next_schedule_note);
  if (!nextDueAt) {
    const error = new Error("Next owner obligation due date is required");
    error.status = 400;
    throw error;
  }
  const timestamp = new Date(nextDueAt).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    const error = new Error("Next owner obligation due date must be a valid future time");
    error.status = 400;
    throw error;
  }
  if (!nextScheduleNote) {
    const error = new Error("Next owner obligation timing note is required");
    error.status = 400;
    throw error;
  }
  return { nextDueAt: new Date(timestamp).toISOString(), nextScheduleNote };
}

async function requireLead(leadId) {
  if (!leadId) return null;
  const { data, error } = await supabaseAdmin
    .from("organization_leads")
    .select("id,status,organization_id,email,company,contact,created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error("ACQUISITION_LEAD_NOT_FOUND");
    missing.status = 400;
    throw missing;
  }
  return data;
}

async function readAcquisition(acquisitionId) {
  const { data, error } = await supabaseAdmin
    .from("platform_acquisition_records")
    .select("id,seller_organization_id,lead_id,subscription_id,customer_organization_id,stage,prospect_company,prospect_contact,prospect_email,first_value_at")
    .eq("id", acquisitionId)
    .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function requireSubscription(subscriptionId, acquisition) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id,lead_id,organization_id,email,status,created_at")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error("ACQUISITION_SUBSCRIPTION_NOT_FOUND");
    missing.status = 400;
    throw missing;
  }
  if (!data.lead_id) {
    const missingLead = new Error("ACQUISITION_SUBSCRIPTION_LEAD_REQUIRED");
    missingLead.status = 409;
    throw missingLead;
  }
  if (acquisition.lead_id && data.lead_id !== acquisition.lead_id) {
    const conflict = new Error("ACQUISITION_SUBSCRIPTION_LEAD_MISMATCH");
    conflict.status = 409;
    throw conflict;
  }
  return data;
}

async function requireCustomerOrganization(customerOrganizationId) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,status,organization_status,created_at")
    .eq("id", customerOrganizationId)
    .neq("id", PLATFORM_ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error("ACQUISITION_CUSTOMER_ORGANIZATION_NOT_FOUND");
    missing.status = 400;
    throw missing;
  }
  return data;
}

async function requireActiveHuman(customerOrganizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_users")
    .select("id,organization_id,status,created_at")
    .eq("organization_id", customerOrganizationId)
    .ilike("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    const missing = new Error("ACQUISITION_ACTIVE_HUMAN_NOT_PROVEN");
    missing.status = 409;
    throw missing;
  }
  return row;
}

async function requireFirstSuccessfulUse(customerOrganizationId) {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id,created_at,execution_status,status,capability,operation")
    .eq("organization_id", customerOrganizationId)
    .or(executionStateFilter("success"))
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.created_at) {
    const missing = new Error("ACQUISITION_FIRST_VALUE_NOT_PROVEN");
    missing.status = 409;
    throw missing;
  }
  return row;
}

function rpcErrorStatus(error) {
  const message = text(error?.message);
  if (message.includes("ACQUISITION_STAGE_CONFLICT")) return 409;
  if (message.includes("ACQUISITION_TRANSITION_NOT_ALLOWED")) return 409;
  if (message.includes("_MISMATCH") || message.includes("_NOT_PROVEN")) return 409;
  if (message.includes("ACQUISITION_NOT_FOUND")) return 404;
  if (message.includes("ACQUISITION_") && message.includes("REQUIRED")) return 400;
  return Number(error?.status || 500);
}

function requireManualEvidence({ evidenceReference, note, label }) {
  if (!evidenceReference) {
    const error = new Error(`${label} evidence reference is required`);
    error.status = 400;
    throw error;
  }
  if (!note) {
    const error = new Error(`${label} evidence note is required`);
    error.status = 400;
    throw error;
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
    const evidenceType = text(body.evidenceType || body.evidence_type);
    if (!evidenceType) {
      return Response.json({ success: false, error: "Evidence type is required" }, { status: 400 });
    }
    const { nextDueAt, nextScheduleNote } = requireNextObligation(body);

    const leadId = uuidOrNull(body.leadId || body.lead_id);
    await requireLead(leadId);

    const { data, error } = await supabaseAdmin.rpc("platform_create_acquisition_v2", {
      p_seller_organization_id: PLATFORM_ORGANIZATION_ID,
      p_evidence_type: evidenceType,
      p_evidence_reference: text(body.evidenceReference || body.evidence_reference) || null,
      p_note: text(body.note) || null,
      p_lead_id: leadId,
      p_source: text(body.source) || null,
      p_source_reference: text(body.sourceReference || body.source_reference) || null,
      p_next_due_at: nextDueAt,
      p_next_schedule_note: nextScheduleNote,
      p_owner_staff_account_id: access.staff.id,
    });
    if (error) throw error;

    return Response.json({
      success: true,
      acquisition: data,
      authority: "AVANTIQO_PLATFORM_ATOMIC_ACQUISITION_CREATE_V2",
    }, { status: 201 });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_CREATE_ERROR", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to create acquisition record" },
      { status: rpcErrorStatus(error) },
    );
  }
}

export async function PATCH(request) {
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
    const acquisitionId = uuidOrNull(body.acquisitionId || body.acquisition_id);
    const expectedFromStage = text(body.expectedFromStage || body.expected_from_stage).toUpperCase();
    const toStage = text(body.toStage || body.to_stage).toUpperCase();
    if (!acquisitionId || !expectedFromStage || !toStage) {
      return Response.json(
        { success: false, error: "Acquisition ID, expected current stage, and target stage are required" },
        { status: 400 },
      );
    }

    const acquisition = await readAcquisition(acquisitionId);
    if (!acquisition) {
      return Response.json({ success: false, error: "Acquisition record not found" }, { status: 404 });
    }
    if (acquisition.stage !== expectedFromStage) {
      return Response.json(
        { success: false, error: `Acquisition stage changed; current stage is ${acquisition.stage}` },
        { status: 409 },
      );
    }

    const nextObligation = TERMINAL_STAGES.has(toStage) ? { nextDueAt: null, nextScheduleNote: null } : requireNextObligation(body);
    let subscriptionId = uuidOrNull(body.subscriptionId || body.subscription_id) || acquisition.subscription_id;
    let customerOrganizationId = acquisition.customer_organization_id;
    let firstValueAt = null;
    let evidenceType = text(body.evidenceType || body.evidence_type);
    let evidenceReference = text(body.evidenceReference || body.evidence_reference) || null;
    let note = text(body.note) || null;
    const prospectCompany = text(body.prospectCompany || body.prospect_company) || acquisition.prospect_company || null;
    const prospectContact = text(body.prospectContact || body.prospect_contact) || acquisition.prospect_contact || null;
    const prospectEmail = text(body.prospectEmail || body.prospect_email).toLowerCase() || acquisition.prospect_email || null;

    if (toStage === "QUALIFIED") {
      if (!prospectCompany || !prospectContact || !prospectEmail) {
        return Response.json(
          { success: false, error: "Company, contact, and email are required to qualify a prospect" },
          { status: 400 },
        );
      }
      requireManualEvidence({ evidenceReference, note, label: "Qualification" });
      evidenceType = "QUALIFICATION_EVIDENCE_RECORDED";
    }

    if (toStage === "COMMITMENT_PENDING") {
      requireManualEvidence({ evidenceReference, note, label: "Commitment" });
      evidenceType = "COMMITMENT_EVIDENCE_RECORDED";
    }

    if (toStage === "LOST") {
      requireManualEvidence({ evidenceReference, note, label: "Loss" });
      evidenceType = "ACQUISITION_LOSS_RECORDED";
    }

    if (toStage === "COMMITTED") {
      if (!subscriptionId) {
        return Response.json({ success: false, error: "Subscription evidence is required for COMMITTED" }, { status: 400 });
      }
      if (!prospectEmail) {
        return Response.json({ success: false, error: "Qualified prospect identity is required before commitment" }, { status: 409 });
      }
      const subscription = await requireSubscription(subscriptionId, acquisition);
      evidenceType = "SUBSCRIPTION_RECORD_VERIFIED";
      evidenceReference = subscription.id;
      note = note || `Subscription status: ${text(subscription.status) || "unknown"}`;
    }

    if (toStage === "CUSTOMER_CREATED") {
      if (!acquisition.subscription_id) {
        return Response.json({ success: false, error: "A committed subscription is required before customer creation" }, { status: 409 });
      }
      const subscription = await requireSubscription(acquisition.subscription_id, acquisition);
      if (!subscription.organization_id) {
        return Response.json(
          { success: false, error: "The committed subscription is not linked to a customer organization yet" },
          { status: 409 },
        );
      }
      customerOrganizationId = subscription.organization_id;
      const organization = await requireCustomerOrganization(customerOrganizationId);
      evidenceType = "CUSTOMER_ORGANIZATION_VERIFIED";
      evidenceReference = organization.id;
      note = note || `Customer organization verified from committed subscription: ${text(organization.name) || organization.id}`;
    }

    if (["HUMAN_ACTIVE", "FIRST_VALUE"].includes(toStage)) {
      if (!customerOrganizationId) {
        return Response.json({ success: false, error: `Customer organization evidence is required for ${toStage}` }, { status: 400 });
      }
      await requireCustomerOrganization(customerOrganizationId);
    }

    if (toStage === "HUMAN_ACTIVE") {
      const human = await requireActiveHuman(customerOrganizationId);
      evidenceType = "ACTIVE_ORGANIZATION_USER_VERIFIED";
      evidenceReference = human.id;
      note = note || "At least one active human organization user is persisted.";
    }

    if (toStage === "FIRST_VALUE") {
      await requireActiveHuman(customerOrganizationId);
      const successfulUse = await requireFirstSuccessfulUse(customerOrganizationId);
      firstValueAt = successfulUse.created_at;
      evidenceType = "FIRST_SUCCESSFUL_SERVICE_USE_VERIFIED";
      evidenceReference = successfulUse.id;
      note = note || `First successful metered service use: ${text(successfulUse.capability || successfulUse.operation) || "service execution"}`;
    }

    if (!evidenceType) {
      return Response.json({ success: false, error: "Evidence type is required for this transition" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("platform_transition_acquisition_v3", {
      p_acquisition_id: acquisitionId,
      p_seller_organization_id: PLATFORM_ORGANIZATION_ID,
      p_expected_from_stage: expectedFromStage,
      p_to_stage: toStage,
      p_evidence_type: evidenceType,
      p_evidence_reference: evidenceReference,
      p_note: note,
      p_prospect_company: prospectCompany,
      p_prospect_contact: prospectContact,
      p_prospect_email: prospectEmail,
      p_subscription_id: subscriptionId,
      p_customer_organization_id: customerOrganizationId,
      p_first_value_at: firstValueAt,
      p_next_due_at: nextObligation.nextDueAt,
      p_next_schedule_note: nextObligation.nextScheduleNote,
      p_owner_staff_account_id: TERMINAL_STAGES.has(toStage) ? null : access.staff.id,
    });
    if (error) throw error;

    return Response.json({
      success: true,
      acquisition: data,
      authority: "AVANTIQO_PLATFORM_ATOMIC_ACQUISITION_TRANSITION_V3",
    });
  } catch (error) {
    console.error("PLATFORM_ACQUISITION_TRANSITION_ERROR", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to transition acquisition record" },
      { status: rpcErrorStatus(error) },
    );
  }
}
