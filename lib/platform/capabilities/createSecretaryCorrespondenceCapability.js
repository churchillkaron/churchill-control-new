import {
  draftOutboundMessage,
  getCommunicationInbox,
  getConversationTimeline,
  openConversation,
  queueDraftOutboundMessage,
  setConversationStatus,
} from "@/lib/commercial/communications/CommunicationService";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const WRITE_PERMISSION = "commercial.communications.write";
const SEND_PERMISSION = "commercial.communications.send";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function actorPartyId(context = {}) {
  return text(
    context.actor?.partyId ||
      context.actor?.party_id ||
      context.metadata?.partyId,
    120,
  ) || null;
}

function boundedLimit(value, fallback = 50, max = 200) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(max, Math.floor(number)))
    : fallback;
}

function attachmentArray(value) {
  return Array.isArray(value) ? value.slice(0, 10) : [];
}

const ACTIONS = Object.freeze({
  inbox: {
    mode: "read",
    risk: "low",
    reversible: true,
    confirm: false,
    permission: null,
    description: "Read the organization Communications inbox so Avantiqo Secretary can triage written correspondence across connected channels.",
    aliases: ["show my inbox", "check messages", "what messages need attention", "show unread messages"],
  },
  read: {
    mode: "read",
    risk: "low",
    reversible: true,
    confirm: false,
    permission: null,
    description: "Read one exact organization-scoped Communications conversation and its message timeline without changing read state.",
    aliases: ["read this conversation", "open this message thread", "show the messages in this conversation"],
  },
  open: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    permission: WRITE_PERMISSION,
    description: "Open a canonical Communications conversation for new Secretary correspondence. This creates no outbound message and sends nothing.",
    aliases: ["start a message to", "start an email to", "open a conversation with"],
  },
  draft: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    permission: WRITE_PERMISSION,
    description: "Save an exact Secretary reply or new correspondence as a canonical DRAFT. Drafting never queues or sends the message.",
    aliases: ["draft a reply", "write a reply", "prepare an email", "draft a message"],
  },
  sendDraft: {
    mode: "write",
    risk: "high",
    reversible: false,
    confirm: true,
    permission: SEND_PERMISSION,
    description: "Send one exact already-saved Secretary DRAFT through its canonical Communications channel. The body cannot be replaced at send time.",
    aliases: ["send the draft", "send that reply", "send this message", "send the prepared email"],
  },
  setStatus: {
    mode: "write",
    risk: "low",
    reversible: true,
    confirm: false,
    permission: WRITE_PERMISSION,
    description: "Open, archive or close an exact organization-scoped Communications conversation for Secretary inbox administration.",
    aliases: ["archive this conversation", "close this thread", "reopen this conversation"],
  },
});

function schemaFor(action) {
  switch (action) {
    case "inbox":
      return {
        type: "object",
        properties: {
          provider: { type: "string" },
          search: { type: "string" },
          unread_only: { type: "boolean" },
          status: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      };
    case "read":
      return {
        type: "object",
        properties: { conversation_id: { type: "string" } },
        required: ["conversation_id"],
        additionalProperties: false,
      };
    case "open":
      return {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          recipient_address: { type: "string" },
          recipient_name: { type: "string" },
          subject: { type: "string" },
          customer_party_id: { type: "string" },
        },
        required: ["connection_id", "recipient_address"],
        additionalProperties: false,
      };
    case "draft":
      return {
        type: "object",
        properties: {
          conversation_id: { type: "string" },
          customer_party_id: { type: "string" },
          body: { type: "string" },
          subject: { type: "string" },
          attachments: { type: "array", maxItems: 10, items: { type: "object" } },
          source_context: { type: "object" },
        },
        required: ["conversation_id"],
        additionalProperties: false,
      };
    case "sendDraft":
      return {
        type: "object",
        properties: {
          conversation_id: { type: "string" },
          message_id: { type: "string" },
        },
        required: ["conversation_id", "message_id"],
        additionalProperties: false,
      };
    case "setStatus":
      return {
        type: "object",
        properties: {
          conversation_id: { type: "string" },
          status: { type: "string", enum: ["OPEN", "ARCHIVED", "CLOSED"] },
        },
        required: ["conversation_id", "status"],
        additionalProperties: false,
      };
    default:
      return { type: "object", additionalProperties: false };
  }
}

function authorizeAction(context, config) {
  if (!text(context?.organizationId, 120) || !actorPartyId(context)) return false;
  if (config.permission) return requireExecutionPermission(context, config.permission);
  return true;
}

async function executeAction(action, context, payload = {}) {
  const organizationId = text(context.organizationId, 120);
  const partyId = actorPartyId(context);

  switch (action) {
    case "inbox": { 
      const result = await getCommunicationInbox({
        organizationId,
        provider: text(payload.provider, 120) || null,
        search: text(payload.search, 1000) || null,
      });
      const requestedStatus = text(payload.status, 40).toUpperCase();
      const unreadOnly = payload.unread_only === true || payload.unreadOnly === true;
      const limit = boundedLimit(payload.limit, 50, 200);
      const conversations = (Array.isArray(result.conversations) ? result.conversations : [])
        .filter((row) => !unreadOnly || Number(row?.unread_count || 0) > 0)
        .filter((row) => !requestedStatus || text(row?.status, 40).toUpperCase() === requestedStatus)
        .slice(0, limit);
      return {
        status: "completed",
        conversations,
        connections: Array.isArray(result.connections) ? result.connections : [],
        unread_only: unreadOnly,
        conversation_count: conversations.length,
      };
    }
    case "read":
      return {
        status: "completed",
        ...(await getConversationTimeline({
          organizationId,
          conversationId: text(payload.conversation_id || payload.conversationId, 120),
          markRead: false,
        })),
      };
    case "open": {
      const conversation = await openConversation({
        organizationId,
        connectionId: text(payload.connection_id || payload.connectionId, 120),
        recipientAddress: text(payload.recipient_address || payload.recipientAddress, 1000),
        recipientName: text(payload.recipient_name || payload.recipientName, 500) || null,
        subject: text(payload.subject, 1000) || null,
        customerPartyId: text(payload.customer_party_id || payload.customerPartyId, 120) || null,
      });
      return { status: "completed", conversation, sent: false };
    }
    case "draft": {
      const attachments = attachmentArray(payload.attachments);
      if (!text(payload.body) && !attachments.length) throw new Error("MESSAGE_BODY_OR_ATTACHMENT_REQUIRED");
      const message = await draftOutboundMessage({
        organizationId,
        conversationId: text(payload.conversation_id || payload.conversationId, 120),
        expectedCustomerPartyId: text(payload.customer_party_id || payload.customerPartyId, 120) || null,
        body: payload.body,
        subject: payload.subject,
        attachments,
        sourceContext: payload.source_context || payload.sourceContext || null,
        draftSource: "AVANTIQO_SECRETARY",
        sentByPartyId: partyId,
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
    case "sendDraft": {
      const conversationId = text(payload.conversation_id || payload.conversationId, 120);
      const queued = await queueDraftOutboundMessage({
        organizationId,
        conversationId,
        messageId: text(payload.message_id || payload.messageId, 120),
      });
      const message = await deliverCommunicationMessage({
        organizationId,
        conversationId,
        message: queued,
        partyId,
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
    case "setStatus": {
      const conversation = await setConversationStatus({
        organizationId,
        conversationId: text(payload.conversation_id || payload.conversationId, 120),
        status: text(payload.status, 40).toUpperCase(),
      });
      return { status: "completed", conversation };
    }
    default:
      throw new Error(`SECRETARY_CORRESPONDENCE_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }
}

export function createSecretaryCorrespondenceCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_CORRESPONDENCE_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_correspondence",
    action,
    name: `Secretary correspondence ${action}`,
    document: "communication_conversation",
    description: config.description,
    permissions: config.permission ? [config.permission] : [],
    events: [`platform.secretary.correspondence.${action}`],
    tags: ["platform", "secretary", "correspondence", "communications", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode === "read" ? "read" : config.confirm ? "approve" : "write",
    operatorAutoExecute: config.mode === "read" || config.confirm === false,
    operatorRequiresConfirmation: config.confirm === true,
    contextScope: "organization",
    risk: config.risk,
    reversible: config.reversible,
    approval: config.confirm === true
      ? { required: false, boundary: "conversation_confirmation" }
      : { required: false },
    inputSchema: schemaFor(action),
  });

  function authorize({ context }) {
    return authorizeAction(context, config);
  }

  async function execute({ context, payload = {} }) {
    return executeAction(action, context, payload);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryCorrespondenceCapability;
