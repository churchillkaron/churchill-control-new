import { draftOutboundMessage } from "@/lib/commercial/communications/CommunicationService";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "commercial.communications.write";

function text(value) {
  return String(value ?? "").trim();
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
      body: {
        type: "string",
        description: "Final proposed message text to save as a draft.",
      },
      subject: {
        type: "string",
        description: "Optional subject for email-like channels.",
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
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const message = await draftOutboundMessage({
    organizationId: context.organizationId,
    conversationId: text(payload.conversation_id || payload.conversationId),
    body: payload.body,
    subject: payload.subject,
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
    sent: false,
  };
}
