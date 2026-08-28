import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import Hospitality from "@/lib/operator/secretary/SecretaryHospitalityCoordinationRuntime";

function text(value) { return String(value ?? "").trim(); }

const ACTIONS = Object.freeze({
  start: { mode: "write", aliases: ["start hospitality coordination", "prepare meeting catering and refreshments", "coordinate event hospitality"], execute: Hospitality.start },
  recordStatus: { mode: "write", aliases: ["record hospitality status", "record catering confirmation", "record setup delivery"], execute: Hospitality.recordStatus },
  recordQuote: { mode: "write", aliases: ["record catering quote", "record hospitality quote"], execute: Hospitality.recordQuote },
  refresh: { mode: "write", aliases: ["chase hospitality confirmations", "refresh catering follow ups"], execute: Hospitality.refresh },
  finalize: { mode: "write", aliases: ["finalize hospitality readiness", "freeze event hospitality plan"], execute: Hospitality.finalize },
  reopen: { mode: "write", aliases: ["reopen hospitality readiness", "revise catering readiness"], execute: Hospitality.reopen },
  complete: { mode: "write", aliases: ["complete hospitality coordination", "record hospitality delivered"], execute: Hospitality.complete },
  cancel: { mode: "write", aliases: ["cancel hospitality coordination"], execute: Hospitality.cancel },
  read: { mode: "read", aliases: ["show hospitality coordination", "show catering readiness"], execute: Hospitality.read },
  list: { mode: "read", aliases: ["list hospitality coordination"], execute: Hospitality.list },
});

export function createSecretaryHospitalityCoordinationCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_HOSPITALITY_ACTION_UNSUPPORTED:${text(action)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_hospitality_coordination",
    action,
    name: `Executive Secretary hospitality coordination ${action}`,
    document: "secretary_task",
    description: "Coordinate evidence-backed meeting and event hospitality requirements, headcount, refreshments, catering, accessibility support, confirmations, delivery/setup evidence and exceptions. Quotes are informational only; this capability never places orders, accepts quotes or vendor terms, authorizes service, commits spend, pays, signs, reserves resources or infers confirmation from silence.",
    permissions: [],
    events: [`platform.secretary_hospitality_coordination.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "hospitality", "meeting", "event", "catering", "refreshments", config.mode],
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

export default createSecretaryHospitalityCoordinationCapability;
