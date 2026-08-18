import { draftOutboundMessage } from "@/lib/commercial/communications/CommunicationService";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "commercial.communications.write";
const MAX_ATTACHMENTS = 10;

function text(value) {
  return String(value ?? "").trim();
}

function attachmentList(value) {
  return Array.isArray(value) ? value : [];
}

function sourceContext(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export const manifest = defineCapability({
  domain: "commercial",
  capability: "communication",
  action: "draftMessage",
  description:
    "Save an outbound message as a DRAFT in an existing organization-scoped customer conversation, with optional attachments and source lineage. This never queues or sends the message.",
  permissions: [REQUIRED_PERMISSION],
  events: ["commercial.communication.message.drafted"],
  tags: ["commercial", "communication", "customer", "message", "draft"],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "draft",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  reversible: true,
  approval: { required: false, boundary: "conversation_confirmation" },
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Exact existing Communications conversation id.",
      },
      customer_party_id: {
        type: "string",
        description:
          "Optional expected customer party id. When provided, the conversation must belong to this same customer.",
      },
      body: {
        type: "string",
        description: "Final proposed message text to save as a draft.",
      },
      subject: {
        type: "string",
        description: "Optional subject for email-like channels.",
      },
      attachments: {
        type: "array",
        description:
          "Optional attachment descriptors using external_url or storage_path. At most ten are persisted with the draft.",
        items: { type: "object" },
      },
      source_context: {
        type: "object",
        description:
          "Optional source lineage identifying the business document or workflow that prepared this draft.",
      },
    },
    required: ["conversation_id", "body"],
    additionalProperties: false,
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.conversation_id || payload.conversationId)) {
    const error = new Error("COMMUNICATION_CONVERSATION_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.body)) {
    const error = new Error("MESSAGE_BODY_REQUIRED");
    error.status = 400;
    throw error;
  }

  const attachments = attachmentList(payload.attachments);
  if (attachments.length > MAX_ATTACHMENTS) {
    const error = new Error("COMMUNICATION_ATTACHMENT_LIMIT_EXCEEDED");
    error.status = 400;
    throw error;
  }

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      const error = new Error("COMMUNICATION_ATTACHMENT_INVALID");
      error.status = 400;
      throw error;
    }
    if (!text(attachment.external_url || attachment.url) && !text(attachment.storage_path)) {
      const error = new Error("COMMUNICATION_ATTACHMENT_LOCATION_REQUIRED");
      error.status = 400;
      throw error;
    }
  }

  if (payload.source_context !== undefined && !sourceContext(payload.source_context)) {
    const error = new Error("COMMUNICATION_SOURCE_CONTEXT_INVALID");
    error.status = 400;
    throw error;
  }

  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const message = await draftOutboundMessage({
    organizationId: context.organizationId,
    conversationId: text(payload.conversation_id || payload.conversationId),
    expectedCustomerPartyId:
      text(payload.customer_party_id || payload.customerPartyId) || null,
    body: payload.body,
    subject: payload.subject,
    attachments: attachmentList(payload.attachments),
    sourceContext: sourceContext(payload.source_context),
    draftSource: text(context.metadata?.source) || "AVANTIQO_OPERATOR",
    sentByPartyId:
      context.actor?.partyId ||
      context.actor?.party_id ||
      context.metadata?.partyId ||
      null,
  });

  return {
    status: message.status,
    message_id: message.id,
    conversation_id: message.conversation_id,
    provider: message.provider,
    channel_type: message.channel_type,
    subject: message.subject,
    body: message.body,
    attachment_count: Array.isArray(message.attachments)
      ? message.attachments.length
      : 0,
    sent: false,
  };
}
