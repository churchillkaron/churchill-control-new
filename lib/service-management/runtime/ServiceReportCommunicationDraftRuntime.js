import { execute as executeCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { getServiceReportDeliveryDraft } from "./ServiceReportDeliveryDraftRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export async function createServiceReportCommunicationDraft({
  organizationId,
  occurrenceId,
  conversationId,
  entityId = null,
  periodId = null,
  permissions = [],
  actorId = null,
  actorPartyId = null,
  actorRole = null,
  callerRequest = null,
}) {
  const conversation = text(conversationId);
  if (!conversation) {
    const error = new Error("COMMUNICATION_CONVERSATION_REQUIRED");
    error.status = 400;
    throw error;
  }

  const prepared = await getServiceReportDeliveryDraft({ organizationId, occurrenceId });
  const customerPartyId = text(prepared.customer?.party_id);
  if (!customerPartyId) {
    const error = new Error("SERVICE_REPORT_CUSTOMER_PARTY_REQUIRED");
    error.status = 409;
    throw error;
  }

  const execution = await executeCapability({
    organizationId,
    domain: "commercial",
    capability: "communication",
    action: "draftMessage",
    payload: {
      conversation_id: conversation,
      customer_party_id: customerPartyId,
      subject: prepared.subject,
      body: prepared.body,
      attachments: prepared.attachments,
      source_context: {
        domain: "service-management",
        type: "completed-service-report",
        id: prepared.source.report_id || prepared.source.occurrence_id,
        metadata: prepared.source,
      },
    },
    actor: {
      id: actorId || null,
      partyId: actorPartyId || null,
      role: actorRole || null,
    },
    runtime: {
      entityId: entityId || null,
      periodId: periodId || null,
      permissions: Array.isArray(permissions) ? permissions : [],
      callerRequest,
      metadata: {
        source: "SERVICE_MANAGEMENT_REPORT_DELIVERY",
        sourceDomain: "service-management",
        sourceType: "completed-service-report",
      },
    },
  });

  return Object.freeze({
    prepared,
    communication_draft: Object.freeze({
      status: text(execution?.result?.status) || null,
      message_id: text(execution?.result?.message_id) || null,
      conversation_id: text(execution?.result?.conversation_id) || null,
      provider: text(execution?.result?.provider) || null,
      channel_type: text(execution?.result?.channel_type) || null,
      attachment_count: Number(execution?.result?.attachment_count || 0),
    }),
    send: Object.freeze({
      owner_domain: "commercial.communications",
      requires_explicit_confirmation: true,
      auto_send: false,
    }),
  });
}

export default createServiceReportCommunicationDraft;
