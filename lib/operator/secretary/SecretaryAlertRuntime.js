import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function actorPartyId(context = {}) {
  return text(
    context.actor?.partyId ||
      context.actor?.party_id ||
      context.metadata?.partyId,
    120,
  ) || null;
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function clampLimit(value, fallback = 50, max = 200) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(max, Math.floor(number)))
    : fallback;
}

export async function listSecretaryAlerts({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const partyId = actorPartyId(context);
  if (!partyId) throw new Error("SECRETARY_ALERT_PARTY_REQUIRED");

  let query = supabaseAdmin
    .from("secretary_alerts")
    .select("id,owner_party_id,contact_party_id,alert_kind,source_id,dedupe_key,title,message,priority,due_at,status,surfaced_at,seen_at,resolved_at,metadata,created_at,updated_at")
    .eq("organization_id", organization)
    .or(`owner_party_id.is.null,owner_party_id.eq.${partyId}`)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(clampLimit(payload.limit));

  const requestedStatus = text(payload.status, 40).toUpperCase();
  if (requestedStatus) {
    query = query.eq("status", requestedStatus);
  } else if (payload.include_resolved !== true && payload.includeResolved !== true) {
    query = query.in("status", ["PENDING", "SEEN"]);
  }

  const result = await query;
  if (result.error) throw result.error;
  const alerts = result.data || [];
  return {
    status: "completed",
    count: alerts.length,
    alerts,
    external_authority_used: false,
  };
}

export async function updateSecretaryAlert({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const partyId = actorPartyId(context);
  if (!partyId) throw new Error("SECRETARY_ALERT_PARTY_REQUIRED");
  const alertId = text(payload.alert_id || payload.alertId || payload.id, 120);
  if (!alertId) throw new Error("SECRETARY_ALERT_REQUIRED");
  const status = text(payload.status, 40).toUpperCase();
  if (!["SEEN", "DISMISSED", "RESOLVED"].includes(status)) {
    throw new Error("SECRETARY_ALERT_STATUS_INVALID");
  }

  const now = new Date().toISOString();
  const patch = {
    status,
    updated_at: now,
    ...(status === "SEEN" ? { seen_at: now } : {}),
    ...(status === "RESOLVED" ? { resolved_at: now } : {}),
  };
  const result = await supabaseAdmin
    .from("secretary_alerts")
    .update(patch)
    .eq("organization_id", organization)
    .eq("id", alertId)
    .or(`owner_party_id.is.null,owner_party_id.eq.${partyId}`)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SECRETARY_ALERT_NOT_FOUND");
  return { status: "completed", alert: result.data };
}

export function secretaryAlertsAsAttentionItems(alerts = []) {
  return (Array.isArray(alerts) ? alerts : []).map((alert) => ({
    title: text(alert.title, 180) || "Secretary reminder",
    why_now:
      text(alert.message, 900) ||
      (alert.due_at ? `Due ${alert.due_at}` : "Secretary attention is required."),
    evidence_refs: [`secretary_alert:${alert.id}`],
    recommended_next_step:
      alert.alert_kind === "MISSED_CALL"
        ? "Review the missed call and decide whether to return it."
        : alert.alert_kind === "FOLLOW_UP"
          ? "Complete the due follow-up or reschedule it."
          : alert.alert_kind === "CALENDAR_EVENT"
            ? "Prepare for the upcoming calendar event."
            : "Complete or reschedule the due task.",
    recommended_capability_key: null,
    source: "secretary_alert",
    secretary_alert_id: alert.id,
    priority: alert.priority,
    due_at: alert.due_at,
    alert_kind: alert.alert_kind,
  }));
}

export default listSecretaryAlerts;
