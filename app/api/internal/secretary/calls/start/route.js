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

async function resolveContactParty(phoneLineId, remoteAddress) {
  const phone = text(remoteAddress, 120);
  if (!phone) return { party_id: null, created_or_resolved: false };

  const lineResult = await supabaseAdmin
    .from("secretary_phone_lines")
    .select("organization_id")
    .eq("id", phoneLineId)
    .eq("active", true)
    .maybeSingle();
  if (lineResult.error) throw lineResult.error;
  const organizationId = lineResult.data?.organization_id;
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
    const phoneLineId = text(body?.phoneLineId || body?.phone_line_id, 120);
    const remoteAddress = text(body?.remoteAddress || body?.remote_address, 500) || null;
    const explicitContactPartyId = text(body?.contactPartyId || body?.contact_party_id, 120) || null;
    const language = text(body?.language, 80) || null;
    const autoAnswer = body?.autoAnswer !== false && body?.auto_answer !== false;

    if (!phoneLineId) {
      return Response.json(
        { success: false, error: "phoneLineId required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const resolvedContact = explicitContactPartyId
      ? { party_id: explicitContactPartyId, created_or_resolved: false }
      : await resolveContactParty(phoneLineId, remoteAddress);
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
