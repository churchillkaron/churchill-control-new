import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  appendSecretaryExecutiveNote,
  cancelSecretaryExecutiveNote,
  captureSecretaryExecutiveNote,
  finalizeSecretaryExecutiveNote,
  listSecretaryExecutiveNotes,
  readSecretaryExecutiveNote,
  reviseSecretaryExecutiveNote,
} from "@/lib/operator/secretary/SecretaryExecutiveNotesDictationRuntime";

const ACTIONS = Object.freeze({
  capture: { mode: "write", execute: captureSecretaryExecutiveNote, aliases: ["take this down", "capture this note", "dictate this", "record this memo"] },
  append: { mode: "write", execute: appendSecretaryExecutiveNote, aliases: ["add this to the note", "continue dictation", "append to note"] },
  revise: { mode: "write", execute: reviseSecretaryExecutiveNote, aliases: ["correct this note", "replace note text", "revise the memo"] },
  finalize: { mode: "write", execute: finalizeSecretaryExecutiveNote, aliases: ["finalize this note", "mark memo final"] },
  cancel: { mode: "write", execute: cancelSecretaryExecutiveNote, aliases: ["cancel this note", "discard this note record"] },
  read: { mode: "read", execute: readSecretaryExecutiveNote, aliases: ["show this note", "read this memo"] },
  list: { mode: "read", execute: listSecretaryExecutiveNotes, aliases: ["show my notes", "list executive notes", "show dictations"] },
});

function schema(action) {
  if (action === "capture") return { type: "object", properties: { kind: { type: "string", enum: ["DICTATION","EXECUTIVE_NOTE","MEMO","LETTER_DRAFT","BRIEFING_NOTE","OTHER"] }, title: { type: "string" }, content: { type: "string" }, evidence_id: { type: "string" }, captured_at: { type: "string" }, speaker_party_id: { type: "string" }, source_reference: { type: "string" }, entity_id: { type: "string" } }, required: ["title","content","evidence_id","captured_at"], additionalProperties: false };
  if (action === "append") return { type: "object", properties: { note_id: { type: "string" }, segment: { type: "string" }, evidence_id: { type: "string" }, appended_at: { type: "string" }, expected_version: { type: "number" } }, required: ["note_id","segment","evidence_id","appended_at","expected_version"], additionalProperties: false };
  if (action === "revise") return { type: "object", properties: { note_id: { type: "string" }, replacement_content: { type: "string" }, evidence_id: { type: "string" }, revised_at: { type: "string" }, expected_version: { type: "number" } }, required: ["note_id","replacement_content","evidence_id","revised_at","expected_version"], additionalProperties: false };
  if (action === "finalize") return { type: "object", properties: { note_id: { type: "string" }, evidence_id: { type: "string" }, finalized_at: { type: "string" }, expected_version: { type: "number" } }, required: ["note_id","evidence_id","finalized_at","expected_version"], additionalProperties: false };
  if (action === "cancel") return { type: "object", properties: { note_id: { type: "string" }, evidence_id: { type: "string" }, cancelled_at: { type: "string" }, expected_version: { type: "number" }, reason: { type: "string" } }, required: ["note_id","evidence_id","cancelled_at","expected_version"], additionalProperties: false };
  if (action === "read") return { type: "object", properties: { note_id: { type: "string" } }, required: ["note_id"], additionalProperties: false };
  return { type: "object", properties: { kind: { type: "string" }, include_cancelled: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
}

export function createSecretaryExecutiveNotesDictationCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_NOTES_ACTION_UNSUPPORTED:${action}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_executive_notes",
    action,
    name: `Executive Secretary notes and dictation ${action}`,
    document: "secretary_executive_notes",
    description: "Capture and preserve exact executive note or dictation text with evidence-backed version history. This never sends correspondence, creates directives/decisions/commitments, signs documents, or executes work.",
    permissions: [],
    events: [`platform.secretary_executive_notes.${action}`],
    tags: ["platform","secretary","executive-secretary","notes","dictation","memo",config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode === "write",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.mode === "write" ? "medium" : "low",
    reversible: true,
    approval: { required: false },
    inputSchema: schema(action),
  });
  return {
    manifest,
    authorize: ({ context }) => Boolean(context?.organizationId && (context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId)),
    execute: ({ context, payload = {} }) => config.execute({ context, payload }),
  };
}

export default createSecretaryExecutiveNotesDictationCapability;
