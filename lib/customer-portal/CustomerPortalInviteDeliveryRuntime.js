import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import {
  draftOutboundMessage,
  queueDraftOutboundMessage,
} from "@/lib/commercial/communications/CommunicationService";
import { evaluateSecretaryContactQuietHours } from "@/lib/operator/secretary/SecretaryContactQuietHoursRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function activePortalSession({ organizationId, partyId }) {
  const result = await supabaseAdmin.from("customer_portal_sessions")
    .select("id,expires_at,last_seen_at")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function contactPreferences({ organizationId, partyId }) {
  const result = await supabaseAdmin.from("secretary_contact_profiles")
    .select("preferred_channel,timezone,allow_messages,do_not_disturb")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || {};
}

async function candidateConversation({ organizationId, partyId, preferredChannel, conversationId = null }) {
  if (conversationId) {
    const exact = await supabaseAdmin.from("communication_conversations")
      .select("id,provider,channel_type,customer_party_id,status,last_message_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("id", conversationId)
      .eq("customer_party_id", partyId)
      .eq("status", "OPEN")
      .neq("provider", "customer_portal")
      .neq("channel_type", "portal")
      .maybeSingle();
    if (exact.error) throw exact.error;
    return exact.data || null;
  }
  const result = await supabaseAdmin.from("communication_conversations")
    .select("id,provider,channel_type,customer_party_id,status,last_message_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("customer_party_id", partyId)
    .eq("status", "OPEN")
    .neq("provider", "customer_portal")
    .neq("channel_type", "portal")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (!rows.length) return null;
  const preferred = text(preferredChannel, 120).toLowerCase();
  if (!preferred) return rows[0];
  return rows.find((row) =>
    text(row.provider, 120).toLowerCase() === preferred ||
    text(row.channel_type, 120).toLowerCase() === preferred
  ) || rows[0];
}

async function existingInviteMessage({ organizationId, partyId, sourceType, sourceId }) {
  const result = await supabaseAdmin.from("communication_messages")
    .select("id,conversation_id,status,sent_at,created_at,metadata")
    .eq("organization_id", organizationId)
    .eq("direction", "OUTBOUND")
    .contains("metadata", {
      source: "AVANTIQO_CUSTOMER_PORTAL",
      source_context: {
        kind: "CUSTOMER_PORTAL_INVITE",
        party_id: partyId,
        source_type: text(sourceType, 120).toUpperCase(),
        source_id: text(sourceId, 500),
      },
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}


export async function inspectCustomerPortalInviteState({ organizationId, partyId, sourceType, sourceId } = {}) {
  if (!organizationId || !partyId || !sourceType || !sourceId) {
    return { active_session: null, prior_message: null };
  }
  const [activeSession, priorMessage] = await Promise.all([
    activePortalSession({ organizationId, partyId }),
    existingInviteMessage({ organizationId, partyId, sourceType, sourceId }),
  ]);
  return { active_session: activeSession, prior_message: priorMessage };
}

async function organizationName(organizationId) {
  const result = await supabaseAdmin.from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return text(result.data?.name, 200) || "our team";
}

export async function deliverCustomerPortalInviteIfEligible({
  organizationId,
  partyId,
  access,
  sourceType,
  sourceId,
  ignoreExistingMessage = false,
  conversationId = null,
} = {}) {
  if (!organizationId || !partyId || !access?.url || !sourceType || !sourceId) {
    return { delivered: false, skipped: true, reason: "PORTAL_INVITE_DELIVERY_CONTEXT_REQUIRED" };
  }

  if (await activePortalSession({ organizationId, partyId })) {
    return { delivered: false, skipped: true, reason: "ACTIVE_PORTAL_SESSION_EXISTS" };
  }

  const prior = ignoreExistingMessage ? null : await existingInviteMessage({ organizationId, partyId, sourceType, sourceId });
  if (prior) {
    return {
      delivered: ["SENT", "DELIVERED", "READ"].includes(text(prior.status, 40).toUpperCase()),
      skipped: true,
      reason: "PORTAL_INVITE_ALREADY_MATERIALIZED",
      message_id: prior.id,
      status: prior.status,
    };
  }

  const preferences = await contactPreferences({ organizationId, partyId });
  if (preferences.allow_messages === false) {
    return { delivered: false, skipped: true, reason: "CONTACT_MESSAGES_DISABLED" };
  }

  const quiet = evaluateSecretaryContactQuietHours({
    doNotDisturb: object(preferences.do_not_disturb),
    timezone: text(preferences.timezone, 120) || "UTC",
    channel: "MESSAGE",
    now: new Date(),
  });
  if (quiet.blocked) {
    return {
      delivered: false,
      skipped: true,
      reason: quiet.reason || "CONTACT_QUIET_HOURS",
      defer_until: quiet.defer_until || null,
    };
  }

  const conversation = await candidateConversation({
    organizationId,
    partyId,
    preferredChannel: preferences.preferred_channel,
    conversationId,
  });
  if (!conversation) {
    return { delivered: false, skipped: true, reason: "NO_OPEN_CUSTOMER_CONVERSATION" };
  }

  const companyName = await organizationName(organizationId);
  const sourceLabel = text(sourceType, 120).replaceAll("_", " ").toLowerCase();
  const historyBody = `Secure ${companyName} customer portal invitation for your ${sourceLabel}. The one-time access URL is intentionally not stored in message history.`;
  const transientDeliveryBody = `Your ${companyName} customer portal is ready for your ${sourceLabel}. You can view bookings, orders, invoices, payments, wallet balance and messages here: ${access.url}`;
  const sourceContext = {
    kind: "CUSTOMER_PORTAL_INVITE",
    party_id: partyId,
    source_type: text(sourceType, 120).toUpperCase(),
    source_id: text(sourceId, 500),
    customer_portal_access_link_id: access.access_link_id || null,
  };

  const draft = await draftOutboundMessage({
    organizationId,
    conversationId: conversation.id,
    expectedCustomerPartyId: partyId,
    body: historyBody,
    sourceContext,
    draftSource: "AVANTIQO_CUSTOMER_PORTAL",
    sentByPartyId: null,
  });
  const queued = await queueDraftOutboundMessage({
    organizationId,
    conversationId: conversation.id,
    messageId: draft.id,
  });
  const delivered = await deliverCommunicationMessage({
    organizationId,
    conversationId: conversation.id,
    message: queued,
    partyId: null,
    transientBody: transientDeliveryBody,
    sensitiveBody: true,
  });
  const status = text(delivered?.status, 40).toUpperCase();
  return {
    delivered: ["SENT", "DELIVERED", "READ"].includes(status),
    skipped: false,
    reason: status === "FAILED" ? "PORTAL_INVITE_DELIVERY_FAILED" : null,
    conversation_id: conversation.id,
    message_id: delivered?.id || queued.id,
    status,
  };
}

export default Object.freeze({ deliver: deliverCustomerPortalInviteIfEligible, inspect: inspectCustomerPortalInviteState });
