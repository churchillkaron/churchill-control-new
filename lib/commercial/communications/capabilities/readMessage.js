import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { getMessage } from "@/lib/commercial/communications/CommunicationRepository";

const REQUIRED_PERMISSION = "commercial.communications.send";
const text = (value) => String(value ?? "").trim();

export const manifest = defineCapability({
  domain: "commercial", capability: "communication", action: "read",
  description: "Read one exact organization-scoped communication message from its exact conversation and message ids.",
  permissions: [REQUIRED_PERMISSION], events: [], tags: ["commercial", "communication", "message", "read", "verification"],
  transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true,
  operatorRequiresConfirmation: false, risk: "low", contextScope: "organization",
  inputSchema: { type: "object", required: ["conversation_id", "message_id"], properties: { conversation_id: { type: "string" }, message_id: { type: "string" } }, additionalProperties: false },
});

export function authorize({ context }) { return requireExecutionPermission(context, REQUIRED_PERMISSION); }
export async function execute({ context, payload = {} }) {
  const conversationId = text(payload.conversation_id);
  const messageId = text(payload.message_id);
  if (!conversationId || !messageId) throw new Error("conversation_id and message_id required");
  const message = await getMessage({ organizationId: context.organizationId, conversationId, messageId });
  return { success: true, conversation_id: conversationId, message_id: messageId, message, found: Boolean(message) };
}
