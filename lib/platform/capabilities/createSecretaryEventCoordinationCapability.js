import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  startSecretaryEventCoordination,
  linkSecretaryEventComponent,
  unlinkSecretaryEventComponent,
  linkSecretaryEventReference,
  unlinkSecretaryEventReference,
  refreshSecretaryEventCoordination,
  markSecretaryEventReady,
  reopenSecretaryEventCoordination,
  completeSecretaryEventCoordination,
  cancelSecretaryEventCoordination,
  readSecretaryEventCoordination,
  listSecretaryEventCoordinations,
} from "@/lib/operator/secretary/SecretaryEventCoordinationRuntime";

const ACTIONS = Object.freeze({
  start: { mode: "write", execute: startSecretaryEventCoordination, aliases: ["coordinate event", "manage event logistics", "start event coordination"] },
  linkComponent: { mode: "write", execute: linkSecretaryEventComponent, aliases: ["link event workflow", "link event logistics"] },
  unlinkComponent: { mode: "write", execute: unlinkSecretaryEventComponent, aliases: ["unlink event workflow", "remove event logistics link"] },
  linkReference: { mode: "write", execute: linkSecretaryEventReference, aliases: ["link event document", "link event deadline", "link event correspondence"] },
  unlinkReference: { mode: "write", execute: unlinkSecretaryEventReference, aliases: ["unlink event reference", "remove event document link"] },
  refresh: { mode: "write", execute: refreshSecretaryEventCoordination, aliases: ["refresh event readiness", "check event readiness"] },
  markReady: { mode: "write", execute: markSecretaryEventReady, aliases: ["mark event ready", "finalize event readiness"] },
  reopen: { mode: "write", execute: reopenSecretaryEventCoordination, aliases: ["reopen event coordination", "revise ready event"] },
  complete: { mode: "write", execute: completeSecretaryEventCoordination, aliases: ["complete event coordination", "close event coordination"] },
  cancel: { mode: "write", execute: cancelSecretaryEventCoordination, aliases: ["cancel event coordination", "stop event coordination"] },
  read: { mode: "read", execute: readSecretaryEventCoordination, aliases: ["show event coordination", "show event readiness"] },
  list: { mode: "read", execute: listSecretaryEventCoordinations, aliases: ["list event coordinations", "show coordinated events"] },
});

function commonMutation() {
  return { coordination_id: { type: "string" }, expected_version: { type: "number" }, evidence_id: { type: "string" }, occurred_at: { type: "string" } };
}
function componentSchema() {
  return { type: "object", properties: { kind: { type: "string", enum: ["GUESTS", "RESOURCE", "HOSPITALITY"] }, task_id: { type: "string" }, required: { type: "boolean" } }, required: ["kind", "task_id"], additionalProperties: false };
}
function referenceSchema() {
  return { type: "object", properties: { kind: { type: "string", enum: ["DEADLINE", "CORRESPONDENCE", "DOCUMENT", "MEETING_PACK", "OTHER"] }, reference_id: { type: "string" }, label: { type: "string" }, note: { type: "string" } }, required: ["kind", "reference_id"], additionalProperties: false };
}
function schemaFor(action) {
  if (action === "start") return { type: "object", properties: { calendar_event_id: { type: "string" }, title: { type: "string" }, starts_at: { type: "string" }, ends_at: { type: "string" }, timezone: { type: "string" }, location: { type: "string" }, components: { type: "array", items: componentSchema() }, supporting_references: { type: "array", items: referenceSchema() }, evidence_id: { type: "string" }, started_at: { type: "string" }, entity_id: { type: "string" } }, required: ["evidence_id", "started_at"], additionalProperties: false };
  if (action === "linkComponent") return { type: "object", properties: { ...commonMutation(), component: componentSchema() }, required: ["coordination_id", "expected_version", "evidence_id", "occurred_at", "component"], additionalProperties: false };
  if (action === "unlinkComponent") return { type: "object", properties: { ...commonMutation(), kind: { type: "string", enum: ["GUESTS", "RESOURCE", "HOSPITALITY"] }, task_id: { type: "string" } }, required: ["coordination_id", "expected_version", "evidence_id", "occurred_at", "kind", "task_id"], additionalProperties: false };
  if (action === "linkReference") return { type: "object", properties: { ...commonMutation(), reference: referenceSchema() }, required: ["coordination_id", "expected_version", "evidence_id", "occurred_at", "reference"], additionalProperties: false };
  if (action === "unlinkReference") return { type: "object", properties: { ...commonMutation(), kind: { type: "string", enum: ["DEADLINE", "CORRESPONDENCE", "DOCUMENT", "MEETING_PACK", "OTHER"] }, reference_id: { type: "string" } }, required: ["coordination_id", "expected_version", "evidence_id", "occurred_at", "kind", "reference_id"], additionalProperties: false };
  if (["refresh", "markReady", "reopen"].includes(action)) return { type: "object", properties: commonMutation(), required: ["coordination_id", "expected_version", "evidence_id", "occurred_at"], additionalProperties: false };
  if (action === "complete") return { type: "object", properties: { ...commonMutation(), completion_summary: { type: "string" } }, required: ["coordination_id", "expected_version", "evidence_id", "occurred_at", "completion_summary"], additionalProperties: false };
  if (action === "cancel") return { type: "object", properties: { ...commonMutation(), reason: { type: "string" } }, required: ["coordination_id", "expected_version", "evidence_id", "occurred_at", "reason"], additionalProperties: false };
  if (action === "read") return { type: "object", properties: { coordination_id: { type: "string" } }, required: ["coordination_id"], additionalProperties: false };
  return { type: "object", properties: { include_terminal: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
}

export function createSecretaryEventCoordinationCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_EVENT_COORDINATION_CAPABILITY_ACTION_UNSUPPORTED:${action}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_event_coordination",
    action,
    name: `Executive Secretary event coordination ${action}`,
    document: "secretary_event_coordination",
    description: "Own an executive event end-to-end by linking and supervising already-governed guest, resource, hospitality, deadline, correspondence and document workflows. The parent never mutates child authority, grants access, buys, pays, signs, books externally or infers attendance.",
    permissions: [], events: [`platform.secretary_event_coordination.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "event", "coordination", "readiness", config.mode],
    operatorAliases: config.aliases, operatorExamples: config.aliases,
    transactional: config.mode === "write", aiEnabled: false, operatorEnabled: true, operatorMode: config.mode, operatorAutoExecute: true, operatorRequiresConfirmation: false,
    contextScope: "organization", risk: config.mode === "write" ? "medium" : "low", reversible: true, approval: { required: false }, inputSchema: schemaFor(action),
  });
  function authorize({ context }) { return Boolean(context?.organizationId && (context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id)); }
  async function execute({ context, payload = {} }) { return config.execute({ context, payload }); }
  return { manifest, authorize, execute };
}

export default createSecretaryEventCoordinationCapability;