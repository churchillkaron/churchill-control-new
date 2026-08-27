import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  requestSecretaryRecordsRetrieval,
  resolveSecretaryRecordsRetrieval,
  recordSecretaryRecordsRetrievalHandoff,
  cancelSecretaryRecordsRetrieval,
  readSecretaryRecordsRetrieval,
  listSecretaryRecordsRetrievals,
} from "@/lib/operator/secretary/SecretaryRecordsRetrievalRuntime";

const ACTIONS = Object.freeze({
  request: { mode: "write", risk: "low", description: "Create a Secretary records-retrieval request over the existing Document Filing reference register. No external storage access is performed.", aliases: ["find this document", "retrieve this record", "locate this file", "find the archived document"] },
  resolve: { mode: "write", risk: "low", description: "Re-resolve an existing records-retrieval request, optionally selecting one explicit document/version after an ambiguous result.", aliases: ["resolve this retrieval", "select this document", "use this record", "locate this version"] },
  recordHandoff: { mode: "write", risk: "low", description: "Record that a located document reference was handed back internally. This records evidence only and performs no external sharing.", aliases: ["hand back the document reference", "mark retrieval fulfilled", "record document handoff", "give me the located reference"] },
  cancel: { mode: "write", risk: "low", description: "Cancel only the Secretary retrieval request. Source documents and filing records remain unchanged.", aliases: ["cancel document retrieval", "stop looking for this record", "cancel this records request"] },
  read: { mode: "read", risk: "low", description: "Read one Secretary records-retrieval lifecycle and its resolution evidence.", aliases: ["show this retrieval", "read records request", "show located record"] },
  list: { mode: "read", risk: "low", description: "List Secretary records-retrieval requests for the organization.", aliases: ["list record retrievals", "show document searches", "show open records requests"] },
});

function schemaFor(action) {
  const baseLookup = {
    document_id: { type: "string" }, document_key: { type: "string" }, query: { type: "string" }, category: { type: "string" }, document_type: { type: "string" }, subject_reference: { type: "string" }, requested_version: { type: "number" },
  };
  switch (action) {
    case "request": return { type: "object", properties: { ...baseLookup, evidence_id: { type: "string" }, requested_at: { type: "string" }, entity_id: { type: "string" }, priority: { type: "string" }, due_at: { type: "string" } }, required: ["evidence_id", "requested_at"], additionalProperties: false };
    case "resolve": return { type: "object", properties: { retrieval_id: { type: "string" }, evidence_id: { type: "string" }, resolved_at: { type: "string" }, expected_version: { type: "number" }, selected_document_id: { type: "string" }, selected_version: { type: "number" } }, required: ["retrieval_id", "evidence_id", "resolved_at", "expected_version"], additionalProperties: false };
    case "recordHandoff": return { type: "object", properties: { retrieval_id: { type: "string" }, evidence_id: { type: "string" }, handed_off_at: { type: "string" }, expected_version: { type: "number" }, recipient_party_id: { type: "string" }, channel: { type: "string" }, note: { type: "string" } }, required: ["retrieval_id", "evidence_id", "handed_off_at", "expected_version"], additionalProperties: false };
    case "cancel": return { type: "object", properties: { retrieval_id: { type: "string" }, evidence_id: { type: "string" }, cancelled_at: { type: "string" }, expected_version: { type: "number" }, reason: { type: "string" } }, required: ["retrieval_id", "evidence_id", "cancelled_at", "expected_version", "reason"], additionalProperties: false };
    case "read": return { type: "object", properties: { retrieval_id: { type: "string" } }, required: ["retrieval_id"], additionalProperties: false };
    case "list": return { type: "object", properties: { include_terminal: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
    default: return { type: "object", additionalProperties: false };
  }
}

export function createSecretaryRecordsRetrievalCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_RECORDS_RETRIEVAL_ACTION_UNSUPPORTED:${action}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_records_retrieval",
    action,
    name: `Secretary records retrieval ${action}`,
    document: "secretary_records_retrieval",
    description: config.description,
    permissions: [],
    events: [`platform.secretary.records_retrieval.${action}`],
    tags: ["platform", "secretary", "records", "retrieval", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.risk,
    reversible: true,
    approval: { required: false },
    inputSchema: schemaFor(action),
  });
  async function execute({ context, payload = {} }) {
    switch (action) {
      case "request": return requestSecretaryRecordsRetrieval({ context, payload });
      case "resolve": return resolveSecretaryRecordsRetrieval({ context, payload });
      case "recordHandoff": return recordSecretaryRecordsRetrievalHandoff({ context, payload });
      case "cancel": return cancelSecretaryRecordsRetrieval({ context, payload });
      case "read": return readSecretaryRecordsRetrieval({ context, payload });
      case "list": return listSecretaryRecordsRetrievals({ context, payload });
      default: throw new Error(`SECRETARY_RECORDS_RETRIEVAL_ACTION_UNSUPPORTED:${action}`);
    }
  }
  function authorize({ context }) {
    return Boolean(context?.organizationId && (context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId));
  }
  return { manifest, authorize, execute };
}

export default createSecretaryRecordsRetrievalCapability;
