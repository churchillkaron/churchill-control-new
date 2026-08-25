import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function maybeOne(result) {
  if (result.error) throw result.error;
  return result.data || null;
}

async function resolveExistingParty({ organizationId, participantAddress, participantId }) {
  const candidates = [text(participantAddress, 500), text(participantId, 500)].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("@")) {
      const byEmail = await maybeOne(
        supabaseAdmin
          .from("parties")
          .select("id,organization_id,party_type,display_name,email,phone,status")
          .eq("organization_id", organizationId)
          .ilike("email", candidate)
          .limit(1)
          .maybeSingle(),
      );
      if (byEmail) return byEmail;
    }

    const byPhone = await maybeOne(
      supabaseAdmin
        .from("parties")
        .select("id,organization_id,party_type,display_name,email,phone,status")
        .eq("organization_id", organizationId)
        .eq("phone", candidate)
        .limit(1)
        .maybeSingle(),
    );
    if (byPhone) return byPhone;
  }
  return null;
}

async function ensureChannelParty({
  organizationId,
  provider,
  channelType,
  participantId,
  participantAddress,
  participantName,
}) {
  const existingAlias = await maybeOne(
    supabaseAdmin
      .from("secretary_contact_channels")
      .select("id,party_id,external_address,display_name,last_inbound_at")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .eq("channel_type", channelType)
      .eq("external_participant_id", participantId)
      .maybeSingle(),
  );

  if (existingAlias?.party_id) {
    await supabaseAdmin
      .from("secretary_contact_channels")
      .update({
        external_address: participantAddress || existingAlias.external_address || null,
        display_name: participantName || existingAlias.display_name || null,
        last_inbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingAlias.id);
    return existingAlias.party_id;
  }

  let party = await resolveExistingParty({ organizationId, participantAddress, participantId });
  let createdPartyId = null;
  if (!party) {
    const displayName = participantName || participantAddress || participantId || "External contact";
    const address = participantAddress || participantId || null;
    const isEmail = Boolean(address && address.includes("@"));
    const inserted = await supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        party_type: "person",
        display_name: displayName,
        email: isEmail ? address.toLowerCase() : null,
        phone: !isEmail ? address : null,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .select("id,organization_id,party_type,display_name,email,phone,status")
      .single();
    if (inserted.error) throw inserted.error;
    party = inserted.data;
    createdPartyId = party.id;
  }

  const alias = await supabaseAdmin
    .from("secretary_contact_channels")
    .insert({
      organization_id: organizationId,
      party_id: party.id,
      provider,
      channel_type: channelType,
      external_participant_id: participantId,
      external_address: participantAddress || null,
      display_name: participantName || party.display_name || null,
      last_inbound_at: new Date().toISOString(),
      metadata: { source: "communication_inbound" },
    })
    .select("id,party_id")
    .single();

  if (alias.error) {
    if (createdPartyId) {
      const cleanup = await supabaseAdmin
        .from("parties")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", createdPartyId);
      if (cleanup.error) {
        console.error("SECRETARY_MESSAGE_CONTACT_ROLLBACK_FAILED", cleanup.error.message || cleanup.error);
      }
    }
    throw alias.error;
  }

  return party.id;
}

export async function enqueueSecretaryInboundMessage({
  organizationId,
  conversation,
  message,
  participantId,
  participantAddress = null,
  participantName = null,
} = {}) {
  const organization = text(organizationId, 120);
  const conversationId = text(conversation?.id, 120);
  const messageId = text(message?.id, 120);
  const provider = text(message?.provider || conversation?.provider, 120).toLowerCase();
  const channelType = text(message?.channel_type || conversation?.channel_type || provider, 120).toLowerCase();
  const participant = text(participantId || conversation?.external_participant_id, 500);
  if (!organization || !conversationId || !messageId || !provider || !channelType || !participant) {
    throw new Error("SECRETARY_MESSAGE_RECEPTION_IDENTITY_REQUIRED");
  }

  const body = text(message?.body, 12000);
  const attachmentCount = Array.isArray(message?.attachments) ? message.attachments.length : 0;
  if (!body && attachmentCount === 0) {
    return { queued: false, reason: "EMPTY_INBOUND_MESSAGE" };
  }

  const contactPartyId = await ensureChannelParty({
    organizationId: organization,
    provider,
    channelType,
    participantId: participant,
    participantAddress: text(participantAddress || conversation?.external_participant_address, 500) || null,
    participantName: text(participantName || conversation?.external_participant_name, 500) || null,
  });

  const request = await supabaseAdmin
    .from("secretary_message_reception_requests")
    .upsert({
      organization_id: organization,
      conversation_id: conversationId,
      inbound_message_id: messageId,
      contact_party_id: contactPartyId,
      status: "PENDING",
      available_at: new Date().toISOString(),
      metadata: {
        provider,
        channel_type: channelType,
        participant_id: participant,
        attachment_count: attachmentCount,
        caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
        external_authority_used: false,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,inbound_message_id", ignoreDuplicates: true })
    .select("id,status,contact_party_id,created_at")
    .maybeSingle();
  if (request.error) throw request.error;

  await supabaseAdmin
    .from("communication_conversations")
    .update({
      customer_party_id: contactPartyId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization)
    .eq("id", conversationId)
    .is("customer_party_id", null);

  return {
    queued: Boolean(request.data),
    duplicate: !request.data,
    request: request.data || null,
    contact_party_id: contactPartyId,
  };
}

export async function claimSecretaryInboundMessage({ workerId, leaseSeconds = 120 } = {}) {
  const worker = text(workerId, 200);
  if (!worker) throw new Error("SECRETARY_MESSAGE_WORKER_REQUIRED");
  const result = await supabaseAdmin.rpc("claim_secretary_message_reception", {
    p_worker_id: worker,
    p_lease_seconds: Math.max(30, Math.min(Number(leaseSeconds) || 120, 900)),
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

export async function completeSecretaryInboundMessage({ requestId, patch = {} } = {}) {
  const id = text(requestId, 120);
  if (!id) throw new Error("SECRETARY_MESSAGE_REQUEST_REQUIRED");
  const result = await supabaseAdmin
    .from("secretary_message_reception_requests")
    .update({
      status: "COMPLETED",
      detected_language: text(patch.detected_language, 80) || null,
      decision_action: text(patch.decision_action, 120) || null,
      decision: object(patch.decision),
      action_result: object(patch.action_result),
      response_message_id: text(patch.response_message_id, 120) || null,
      completed_at: new Date().toISOString(),
      lease_token: null,
      lease_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function failSecretaryInboundMessage({ requestId, error, retryDelaySeconds = 30 } = {}) {
  const id = text(requestId, 120);
  if (!id) throw new Error("SECRETARY_MESSAGE_REQUEST_REQUIRED");
  const message = text(error?.message || error, 2000) || "Secretary message processing failed";
  const current = await maybeOne(
    supabaseAdmin
      .from("secretary_message_reception_requests")
      .select("attempt_count,max_attempts")
      .eq("id", id)
      .maybeSingle(),
  );
  const exhausted = Number(current?.attempt_count || 0) >= Number(current?.max_attempts || 4);
  const result = await supabaseAdmin
    .from("secretary_message_reception_requests")
    .update({
      status: exhausted ? "SKIPPED" : "FAILED",
      available_at: new Date(Date.now() + Math.max(5, Number(retryDelaySeconds) || 30) * 1000).toISOString(),
      lease_token: null,
      lease_expires_at: null,
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export default {
  enqueueSecretaryInboundMessage,
  claimSecretaryInboundMessage,
  completeSecretaryInboundMessage,
  failSecretaryInboundMessage,
};
