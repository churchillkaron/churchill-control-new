export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  authorizeSecretaryCallIngress,
  secretaryCallIngressUnauthorized,
} from "@/lib/operator/secretary/SecretaryCallIngressAuth";
import {
  answerSecretaryCall,
  beginInboundSecretaryCall,
} from "@/lib/operator/secretary/SecretaryCallerRuntime";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeCalledNumber(value) {
  let result = text(value, 160);
  if (!result) return null;
  result = result.replace(/^sip:/i, "").split("@")[0].trim();
  return result || null;
}

async function resolvePhoneLine({ phoneLineId, calledNumber }) {
  const explicitId = text(phoneLineId, 120);
  if (explicitId) {
    const result = await supabaseAdmin
      .from("secretary_phone_lines")
      .select("id,organization_id,line_address,default_language,timezone")
      .eq("id", explicitId)
      .eq("active", true)
      .eq("inbound_enabled", true)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("SECRETARY_PHONE_LINE_UNAVAILABLE");
    return result.data;
  }

  const did = normalizeCalledNumber(calledNumber);
  if (!did) throw new Error("SECRETARY_CALLED_NUMBER_REQUIRED");

  const result = await supabaseAdmin
    .from("secretary_phone_lines")
    .select("id,organization_id,line_address,default_language,timezone")
    .eq("line_address", did)
    .eq("active", true)
    .eq("inbound_enabled", true)
    .limit(2);
  if (result.error) throw result.error;
  if (!result.data?.length) throw new Error("SECRETARY_DID_NOT_ASSIGNED");
  if (result.data.length > 1) throw new Error("SECRETARY_DID_ASSIGNMENT_AMBIGUOUS");
  return result.data[0];
}

async function resolveContactParty(line, remoteAddress) {
  const phone = text(remoteAddress, 120);
  if (!phone) return { party_id: null, created_or_resolved: false };

  const organizationId = text(line?.organization_id, 120);
  if (!organizationId) return { party_id: null, created_or_resolved: false };

  const partyResult = await supabaseAdmin
    .from("parties")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (partyResult.error) throw partyResult.error;
  if (partyResult.data?.id) {
    return { party_id: partyResult.data.id, created_or_resolved: false };
  }

  const resolved = await supabaseAdmin.rpc("secretary_resolve_message_contact", {
    p_organization_id: organizationId,
    p_provider: "pstn",
    p_channel_type: "call",
    p_external_participant_id: phone,
    p_external_address: phone,
    p_display_name: null,
  });
  if (resolved.error) throw resolved.error;
  const partyId = text(resolved.data, 120) || null;
  return { party_id: partyId, created_or_resolved: Boolean(partyId) };
}

export async function POST(request) {
  if (!authorizeSecretaryCallIngress(request)) {
    return secretaryCallIngressUnauthorized();
  }

  try {
    const body = await request.json();
    const requestedPhoneLineId = text(body?.phoneLineId || body?.phone_line_id, 120) || null;
    const calledNumber = normalizeCalledNumber(
      body?.calledNumber || body?.called_number || body?.did || body?.destination,
    );
    const remoteAddress = text(body?.remoteAddress || body?.remote_address, 500) || null;
    const explicitContactPartyId = text(body?.contactPartyId || body?.contact_party_id, 120) || null;
    const language = text(body?.language, 80) || null;
    const autoAnswer = body?.autoAnswer !== false && body?.auto_answer !== false;

    const line = await resolvePhoneLine({
      phoneLineId: requestedPhoneLineId,
      calledNumber,
    });
    const phoneLineId = line.id;

    const resolvedContact = explicitContactPartyId
      ? { party_id: explicitContactPartyId, created_or_resolved: false }
      : await resolveContactParty(line, remoteAddress);
    const contactPartyId = resolvedContact.party_id;

    const started = await beginInboundSecretaryCall({
      phoneLineId,
      remoteAddress,
      contactPartyId,
      language,
    });
    const answered = autoAnswer
      ? await answerSecretaryCall({ callId: started.call.id })
      : null;

    return Response.json(
      {
        success: true,
        call_id: started.call.id,
        phone_line_id: phoneLineId,
        called_number: calledNumber || line.line_address,
        status: answered?.call?.status || started.call.status,
        greeting: started.greeting,
        default_language: started.default_language,
        timezone: started.timezone,
        contact_matched: Boolean(contactPartyId),
        contact_created_or_resolved: resolvedContact.created_or_resolved,
        caller_authority: started.authority,
        internal_operator_capabilities_available: false,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_CALL_START_INGRESS_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Secretary call start failed" },
      { status: error?.status || 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
