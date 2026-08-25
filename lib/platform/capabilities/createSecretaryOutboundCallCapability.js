import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  listSecretaryOutboundCalls,
  queueSecretaryOutboundCall,
} from "@/lib/operator/secretary/SecretaryOutboundCallRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryOutboundCallCapability(action) {
  if (action === "list") {
    const manifest = defineCapability({
      domain: "platform",
      capability: "secretary_outbound_call",
      action: "list",
      name: "Secretary Outbound Calls",
      document: "secretary_outbound_call_request",
      description: "Read Avantiqo-owned outbound call requests and their current state.",
      permissions: [],
      events: ["platform.secretary_outbound_call.list"],
      tags: ["platform", "secretary", "calls", "outbound", "in-house", "read"],
      operatorAliases: ["show outgoing calls", "show scheduled calls", "what calls are queued", "show outbound call status"],
      operatorExamples: ["show scheduled calls", "what outgoing calls are queued"],
      transactional: false,
      aiEnabled: true,
      operatorEnabled: true,
      operatorMode: "read",
      operatorAutoExecute: true,
      operatorRequiresConfirmation: false,
      contextScope: "organization",
      risk: "low",
      reversible: true,
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    });
    return {
      manifest,
      authorize: ({ context }) => Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id)),
      execute: ({ context, payload }) => listSecretaryOutboundCalls({ context, payload }),
    };
  }

  if (action !== "place") {
    throw new Error(`SECRETARY_OUTBOUND_CAPABILITY_ACTION_UNSUPPORTED:${text(action)}`);
  }

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_outbound_call",
    action: "place",
    name: "Secretary Place Call",
    document: "secretary_outbound_call_request",
    description: "Queue an Avantiqo-owned outbound Secretary call to a contact or explicit phone address. The call objective, policy and conversation remain Avantiqo-owned.",
    permissions: [],
    events: ["platform.secretary_outbound_call.place"],
    tags: ["platform", "secretary", "calls", "outbound", "in-house", "write"],
    operatorAliases: ["call this person", "call them", "phone this contact", "make a call", "call this customer"],
    operatorExamples: ["call Anna and ask if Tuesday works", "phone this contact tomorrow morning"],
    transactional: true,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "high",
    reversible: true,
    approval: { required: false, boundary: "conversation_confirmation" },
    inputSchema: {
      type: "object",
      properties: {
        contact_party_id: { type: "string" },
        remote_address: { type: "string" },
        phone_line_id: { type: "string" },
        objective: { type: "string" },
        language: { type: "string" },
        scheduled_at: { type: "string" },
        max_attempts: { type: "number" },
        metadata: { type: "object" },
      },
      required: ["objective"],
      additionalProperties: false,
    },
  });

  return {
    manifest,
    authorize: ({ context }) => Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id)),
    execute: ({ context, payload }) => queueSecretaryOutboundCall({ context, payload }),
  };
}

export default createSecretaryOutboundCallCapability;
