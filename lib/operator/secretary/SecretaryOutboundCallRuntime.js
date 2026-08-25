import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { evaluateSecretaryContactQuietHours } from "@/lib/operator/secretary/SecretaryContactQuietHoursRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function iso(value, field, fallback = null) {
  const clean = text(value, 120) || fallback;
  if (!clean) return null;
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_OUTBOUND_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

async function one(result) {
  if (result.error) throw result.error;
  return result.data || null;
}

async function resolveLine(organizationId, phoneLineId) {
  let query = supabaseAdmin
    .from("secretary_phone_lines")
    .select("id,organization_id,owner_party_id,line_address,default_language,timezone,outbound_enabled,active")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .eq("outbound_enabled", true);
  if (phoneLineId) query = query.eq("id", phoneLineId);
  const result = await query.order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SECRETARY_OUTBOUND_PHONE_LINE_UNAVAILABLE");
  return result.data;
}

async function resolveContact(organizationId, contactPartyId, remoteAddress) {
  const partyId = text(contactPartyId, 120) || null;
  if (partyId) {
    const party = await one(
      supabaseAdmin
        .from("parties")
        .select("id,display_name,phone,status")
        .eq("organization_id", organizationId)
        .eq("id", partyId)
        .eq("status", "active")
        .maybeSingle(),
    );
    if (!party) throw new Error("SECRETARY_OUTBOUND_CONTACT_NOT_FOUND");
    const profile = await one(
      supabaseAdmin
        .from("secretary_contact_profiles")
        .select("allow_calls,preferred_language,timezone,do_not_disturb")
        .eq("organization_id", organizationId)
        .eq("party_id", party.id)
        .maybeSingle(),
    );
    if (profile?.allow_calls === false) throw new Error("SECRETARY_OUTBOUND_CONTACT_CALLS_DISABLED");
    return {
      party_id: party.id,
      remote_address: text(remoteAddress, 120) || text(party.phone, 120),
      preferred_language: text(profile?.preferred_language, 80) || null,
      timezone: text(profile?.timezone, 120) || null,
      do_not_disturb: object(profile?.do_not_disturb),
    };
  }

  const address = text(remoteAddress, 120);
  if (!address) throw new Error("SECRETARY_OUTBOUND_REMOTE_ADDRESS_REQUIRED");
  return { party_id: null, remote_address: address, preferred_language: null, timezone: null, do_not_disturb: {} };
}

export async function queueSecretaryOutboundCall({ context, payload = {} } = {}) {
  const organizationId = text(context?.organizationId, 120);
  const requestedByPartyId = text(
    context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId,
    120,
  ) || null;
  if (!organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  if (!requestedByPartyId) throw new Error("SECRETARY_OUTBOUND_REQUESTOR_REQUIRED");

  const objective = text(payload.objective || payload.reason || payload.message, 4000);
  if (!objective) throw new Error("SECRETARY_OUTBOUND_OBJECTIVE_REQUIRED");
  const line = await resolveLine(
    organizationId,
    text(payload.phone_line_id || payload.phoneLineId, 120) || null,
  );
  const contact = await resolveContact(
    organizationId,
    payload.contact_party_id || payload.contactPartyId,
    payload.remote_address || payload.remoteAddress,
  );
  if (!contact.remote_address) throw new Error("SECRETARY_OUTBOUND_CONTACT_PHONE_REQUIRED");

  const requestedScheduledAt = iso(
    payload.scheduled_at || payload.scheduledAt,
    "scheduled_at",
    new Date().toISOString(),
  );

  let scheduledAt = requestedScheduledAt;
  let quietHours = null;
  if (contact.party_id) {
    quietHours = evaluateSecretaryContactQuietHours({
      doNotDisturb: contact.do_not_disturb,
      timezone: contact.timezone || line.timezone || context?.timezone || "UTC",
      channel: "CALL",
      now: new Date(requestedScheduledAt),
    });
    if (quietHours.blocked && !quietHours.defer_until) {
      throw new Error("SECRETARY_OUTBOUND_CONTACT_DO_NOT_DISTURB");
    }
    if (quietHours.defer_until) scheduledAt = quietHours.defer_until;
  }

  const language = text(payload.language, 80) || contact.preferred_language || text(line.default_language, 80) || null;

  const request = await one(
    supabaseAdmin
      .from("secretary_outbound_call_requests")
      .insert({
        organization_id: organizationId,
        phone_line_id: line.id,
        contact_party_id: contact.party_id,
        requested_by_party_id: requestedByPartyId,
        remote_address: contact.remote_address,
        objective,
        language,
        status: "PENDING",
        scheduled_at: scheduledAt,
        max_attempts: Math.max(1, Math.min(10, Number(payload.max_attempts || payload.maxAttempts || 3))),
        metadata: {
          ...object(payload.metadata),
          secretary_owned: true,
          external_authority_used: false,
          requested_scheduled_at: requestedScheduledAt,
          quiet_hours_adjusted: scheduledAt !== requestedScheduledAt,
          quiet_hours_reason: quietHours?.reason || null,
          quiet_hours_timezone: quietHours?.timezone || contact.timezone || line.timezone || null,
          contact_do_not_disturb_snapshot: contact.do_not_disturb,
        },
      })
      .select("id,organization_id,phone_line_id,contact_party_id,remote_address,objective,language,status,scheduled_at,attempt_count,max_attempts,created_at")
      .single(),
  );

  return {
    status: "queued",
    outbound_call_request: request,
    requested_scheduled_at: requestedScheduledAt,
    quiet_hours_adjusted: scheduledAt !== requestedScheduledAt,
    external_authority_used: false,
  };
}

export async function listSecretaryOutboundCalls({ context, payload = {} } = {}) {
  const organizationId = text(context?.organizationId, 120);
  if (!organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  let query = supabaseAdmin
    .from("secretary_outbound_call_requests")
    .select("id,phone_line_id,contact_party_id,requested_by_party_id,remote_address,objective,language,status,scheduled_at,attempt_count,max_attempts,call_id,last_error,created_at,updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(payload.limit || 50))));
  const status = text(payload.status, 40).toUpperCase();
  if (status) query = query.eq("status", status);
  const result = await query;
  if (result.error) throw result.error;
  return { status: "completed", count: result.data?.length || 0, requests: result.data || [] };
}

export default queueSecretaryOutboundCall;
