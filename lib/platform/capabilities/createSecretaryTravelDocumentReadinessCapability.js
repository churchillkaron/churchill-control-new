import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import TravelDocuments from "@/lib/operator/secretary/SecretaryTravelDocumentReadinessRuntime";

function text(value) { return String(value ?? "").trim(); }

const ACTIONS = Object.freeze({
  start: { mode: "write", aliases: ["start travel document checklist", "prepare passport and visa checklist"], execute: TravelDocuments.start },
  addRequirement: { mode: "write", aliases: ["add travel document requirement", "add visa checklist item"], execute: TravelDocuments.addRequirement },
  recordStatus: { mode: "write", aliases: ["record travel document status", "mark passport evidence available", "record visa document status"], execute: TravelDocuments.recordStatus },
  refresh: { mode: "write", aliases: ["chase missing travel documents", "refresh travel document follow ups"], execute: TravelDocuments.refresh },
  finalize: { mode: "write", aliases: ["finalize travel document checklist", "freeze travel readiness checklist"], execute: TravelDocuments.finalize },
  reopen: { mode: "write", aliases: ["reopen travel document checklist", "revise travel readiness checklist"], execute: TravelDocuments.reopen },
  cancel: { mode: "write", aliases: ["cancel travel document checklist"], execute: TravelDocuments.cancel },
  read: { mode: "read", aliases: ["show travel document readiness", "show passport visa checklist", "travel document status"], execute: TravelDocuments.read },
  list: { mode: "read", aliases: ["list travel document checklists"], execute: TravelDocuments.list },
});

export function createSecretaryTravelDocumentReadinessCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_TRAVEL_DOCUMENT_ACTION_UNSUPPORTED:${text(action)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_travel_document_readiness",
    action,
    name: `Executive Secretary travel document readiness ${action}`,
    document: "secretary_job",
    description: "Coordinate an evidence-backed passport, visa and entry-document readiness checklist for an existing Secretary travel job. Stores references and status only, rejects sensitive identity-document fields, and never infers visa eligibility, immigration compliance, legal sufficiency or guaranteed border entry.",
    permissions: [],
    events: [`platform.secretary_travel_document_readiness.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "travel", "passport", "visa", "documents", "readiness", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    approval: { required: false },
    inputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) {
    return Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id));
  }
  async function execute({ context, payload = {} }) { return config.execute({ context, payload }); }
  return { manifest, authorize, execute };
}

export default createSecretaryTravelDocumentReadinessCapability;
