import { draftOutboundMessage } from "@/lib/commercial/communications/CommunicationService";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "commercial.communications.write";

function text(value) {
  return String(value ?? "").trim();
}

function attachmentArray(value) {
  return Array.isArray(value) ? value.slice(0, 10) : [];
}

export const manifest = defineCapability({
  domain: "commercial",
  capability: "communication",
  action: "draftMessage",
  description:
    "Save an outbound message as a DRAFT in an existing organization-scoped customer conversation. This never queues or sends the message.",
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
        description: "Optional expected customer party id used to prevent cross-customer drafting.",
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
        maxItems: 10,
        items: { type: "object" },
        description: "Optional canonical Communications attachment descriptors.",
      },
      source_context: {
        type: "object",
        description: "Optional immutable lineage to the business document that prepared this draft.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.conversation_id || payload.conversationId)) {
    const error = new Error("COMMUNICATION_CONVERSATION_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.body) && !attachmentArray(payload.attachments).length) {
    const error = new Error("MESSAGE_BODY_OR_ATTACHMENT_REQUIRED");
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
    expectedCustomerPartyId: text(payload.customer_party_id || payload.customerPartyId) || null,
    body: payload.body,
    subject: payload.subject,
    attachments: attachmentArray(payload.attachments),
    sourceContext: payload.source_context || payload.sourceContext || null,
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
    attachment_count: Array.isArray(message.attachments) ? message.attachments.length : 0,
    sent: false,
  };
}
