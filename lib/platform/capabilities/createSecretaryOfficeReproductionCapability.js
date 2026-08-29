import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  startSecretaryOfficeReproduction,
  recordSecretaryOfficeReproductionProgress,
  completeSecretaryOfficeReproduction,
  cancelSecretaryOfficeReproduction,
  readSecretaryOfficeReproduction,
  listSecretaryOfficeReproduction,
} from "@/lib/operator/secretary/SecretaryOfficeReproductionRuntime";

const ACTIONS = Object.freeze({
  start: { mode: "write", execute: startSecretaryOfficeReproduction, aliases: ["print this document", "coordinate printing", "scan this document", "coordinate scanning"] },
  recordProgress: { mode: "write", execute: recordSecretaryOfficeReproductionProgress, aliases: ["update print job", "update scan job", "record print scan progress"] },
  complete: { mode: "write", execute: completeSecretaryOfficeReproduction, aliases: ["record printing completed", "record scanning completed", "complete print scan request"] },
  cancel: { mode: "write", execute: cancelSecretaryOfficeReproduction, aliases: ["cancel print coordination", "cancel scan coordination"] },
  read: { mode: "read", execute: readSecretaryOfficeReproduction, aliases: ["show print request", "show scan request", "show reproduction request"] },
  list: { mode: "read", execute: listSecretaryOfficeReproduction, aliases: ["list print requests", "list scan requests", "list reproduction requests"] },
});

function commonMutation() {
  return { request_id: { type: "string" }, expected_version: { type: "number" }, evidence_id: { type: "string" }, occurred_at: { type: "string" } };
}
function schemaFor(action) {
  if (action === "start") return { type: "object", properties: { operation: { type: "string", enum: ["PRINT", "SCAN"] }, title: { type: "string" }, source_reference: { type: "string" }, copies: { type: "number" }, duplex: { type: "boolean" }, color_mode: { type: "string", enum: ["AUTO", "COLOR", "GRAYSCALE", "BLACK_WHITE"] }, page_size: { type: "string" }, orientation: { type: "string" }, device_reference: { type: "string" }, output_destination: { type: "string" }, handling_instructions: { type: "string" }, due_at: { type: "string" }, priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] }, evidence_id: { type: "string" }, started_at: { type: "string" }, entity_id: { type: "string" } }, required: ["operation", "title", "source_reference", "evidence_id", "started_at"], additionalProperties: false };
  if (action === "recordProgress") return { type: "object", properties: { ...commonMutation(), stage: { type: "string", enum: ["QUEUED", "HANDED_OFF", "IN_PROCESS", "OUTPUT_READY", "EXCEPTION"] }, note: { type: "string" }, device_reference: { type: "string" }, output_reference: { type: "string" } }, required: ["request_id", "expected_version", "evidence_id", "occurred_at", "stage", "note"], additionalProperties: false };
  if (action === "complete") return { type: "object", properties: { ...commonMutation(), output_reference: { type: "string" }, completion_summary: { type: "string" } }, required: ["request_id", "expected_version", "evidence_id", "occurred_at", "output_reference", "completion_summary"], additionalProperties: false };
  if (action === "cancel") return { type: "object", properties: { ...commonMutation(), reason: { type: "string" } }, required: ["request_id", "expected_version", "evidence_id", "occurred_at", "reason"], additionalProperties: false };
  if (action === "read") return { type: "object", properties: { request_id: { type: "string" } }, required: ["request_id"], additionalProperties: false };
  return { type: "object", properties: { operation: { type: "string", enum: ["PRINT", "SCAN"] }, include_terminal: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
}

export function createSecretaryOfficeReproductionCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_OFFICE_REPRODUCTION_CAPABILITY_ACTION_UNSUPPORTED:${action}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_office_reproduction",
    action,
    name: `Executive Secretary office reproduction ${action}`,
    document: "secretary_office_reproduction",
    description: "Coordinate printing and scanning as normal office administration with explicit evidence. The digital Secretary records handoffs/progress/results but never claims physical device operation, mutates device permissions, stores device credentials, shares externally, buys or pays.",
    permissions: [], events: [`platform.secretary_office_reproduction.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "office", "printing", "scanning", "device-coordination", config.mode],
    operatorAliases: config.aliases, operatorExamples: config.aliases,
    transactional: config.mode === "write", aiEnabled: false, operatorEnabled: true, operatorMode: config.mode, operatorAutoExecute: true, operatorRequiresConfirmation: false,
    contextScope: "organization", risk: config.mode === "write" ? "medium" : "low", reversible: true, approval: { required: false }, inputSchema: schemaFor(action),
  });
  function authorize({ context }) { return Boolean(context?.organizationId && (context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id)); }
  async function execute({ context, payload = {} }) { return config.execute({ context, payload }); }
  return { manifest, authorize, execute };
}

export default createSecretaryOfficeReproductionCapability;