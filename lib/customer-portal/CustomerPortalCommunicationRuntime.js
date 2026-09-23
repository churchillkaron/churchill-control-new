import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function ensureCustomerPortalConversation({ organizationId, partyId }) {
  if (!organizationId || !partyId) throw new Error("CUSTOMER_PORTAL_SCOPE_REQUIRED");
  const existing = await supabaseAdmin.from("communication_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "customer_portal")
    .eq("customer_party_id", partyId)
    .eq("status", "OPEN")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const party = await supabaseAdmin.from("parties")
    .select("display_name,email,phone")
    .eq("organization_id", organizationId)
    .eq("id", partyId)
    .maybeSingle();
  if (party.error) throw party.error;

  const created = await supabaseAdmin.from("communication_conversations").insert({
    organization_id: organizationId,
    provider: "customer_portal",
    channel_type: "portal",
    external_thread_id: `customer-portal:${partyId}`,
    external_participant_id: partyId,
    external_participant_name: party.data?.display_name || "Customer",
    external_participant_address: party.data?.email || party.data?.phone || null,
    customer_party_id: partyId,
    subject: "Customer portal",
    status: "OPEN",
    unread_count: 0,
    metadata: { source: "external_customer_portal" },
  }).select("*").single();
  if (created.error) throw created.error;
  return created.data;
}

export async function createCustomerPortalInboundMessage({
  organizationId,
  partyId,
  sessionId,
  body,
  sourceContext = null,
} = {}) {
  const messageBody = text(body, 12000);
  if (!messageBody) throw new Error("Message required");
  const conversation = await ensureCustomerPortalConversation({ organizationId, partyId });
  const now = new Date().toISOString();
  const inserted = await supabaseAdmin.from("communication_messages").insert({
    organization_id: organizationId,
    conversation_id: conversation.id,
    connection_id: null,
    provider: "customer_portal",
    channel_type: "portal",
    direction: "INBOUND",
    message_type: "TEXT",
    sender_address: "customer_portal",
    body: messageBody,
    status: "RECEIVED",
    received_at: now,
    metadata: {
      source: "EXTERNAL_CUSTOMER_PORTAL",
      customer_portal_session_id: sessionId || null,
      ...(sourceContext && typeof sourceContext === "object" && !Array.isArray(sourceContext)
        ? { source_context: sourceContext }
        : {}),
    },
  }).select("id,conversation_id,body,status,created_at,metadata").single();
  if (inserted.error) throw inserted.error;

  const updated = await supabaseAdmin.from("communication_conversations").update({
    unread_count: Number(conversation.unread_count || 0) + 1,
    last_message_at: now,
    last_inbound_at: now,
    updated_at: now,
  }).eq("id", conversation.id).eq("organization_id", organizationId);
  if (updated.error) throw updated.error;

  const reception = await supabaseAdmin.from("secretary_message_reception_requests").upsert({
    organization_id: organizationId,
    conversation_id: conversation.id,
    inbound_message_id: inserted.data.id,
    contact_party_id: partyId,
    status: "PENDING",
    available_at: now,
    metadata: {
      provider: "customer_portal",
      channel_type: "portal",
      participant_id: partyId,
      canonical_party_preverified: true,
      customer_portal_session_id: sessionId || null,
      source_context: sourceContext && typeof sourceContext === "object" ? sourceContext : null,
      caller_authority: "AUTHENTICATED_CUSTOMER_PORTAL",
      external_authority_used: false,
    },
    updated_at: now,
  }, { onConflict: "organization_id,inbound_message_id", ignoreDuplicates: true })
    .select("id,status,contact_party_id")
    .maybeSingle();
  if (reception.error) throw reception.error;

  return {
    ...inserted.data,
    secretary_reception_request_id: reception.data?.id || null,
    secretary_reception_queued: Boolean(reception.data),
  };
}

export default Object.freeze({
  ensureConversation: ensureCustomerPortalConversation,
  createInboundMessage: createCustomerPortalInboundMessage,
});
