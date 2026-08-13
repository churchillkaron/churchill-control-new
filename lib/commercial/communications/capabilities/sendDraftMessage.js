import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import { queueDraftOutboundMessage } from "@/lib/commercial/communications/CommunicationService";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "commercial.communications.send";

function text(value) {
  return String(value ?? "").trim();
}

export const manifest = defineCapability({
  domain: "commercial",
  capability: "communication",
  action: "sendDraftMessage",
  description:
    "Send one exact, already-saved DRAFT message through its approved connected channel. Requires an explicit conversational confirmation and cannot replace the draft body at send time.",
  permissions: [REQUIRED_PERMISSION],
  events: ["commercial.communication.message.send_requested"],
  tags: ["commercial", "communication", "customer", "message", "send"],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "approve",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "high",
  reversible: false,
  approval: { required: false, boundary: "conversation_confirmation" },
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Exact organization-scoped conversation id owning the draft.",
      },
      message_id: {
        type: "string",
        description: "Exact saved message id; it must still have DRAFT status.",
      },
    },
    required: ["conversation_id", "message_id"],
    additionalProperties: false,
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.conversation_id || payload.conversationId)) {
    const error = new Error("COMMUNICATION_CONVERSATION_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.message_id || payload.messageId)) {
    const error = new Error("COMMUNICATION_DRAFT_MESSAGE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const organizationId = context.organizationId;
  const conversationId = text(
    payload.conversation_id || payload.conversationId,
  );
  const queued = await queueDraftOutboundMessage({
    organizationId,
    conversationId,
    messageId: text(payload.message_id || payload.messageId),
  });
  const message = await deliverCommunicationMessage({
    organizationId,
    conversationId,
    message: queued,
    partyId:
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
    external_message_id: message.external_message_id,
    delivery_pending: message.status === "QUEUED",
    delivery_failed: message.status === "FAILED",
    sent: ["SENT", "DELIVERED", "READ"].includes(message.status),
  };
}
