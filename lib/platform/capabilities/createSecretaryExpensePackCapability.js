import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  addSecretaryExpenseExpectedItem,
  cancelSecretaryExpensePack,
  finalizeSecretaryExpensePack,
  queueSecretaryExpensePackReview,
  readSecretaryExpensePack,
  recordSecretaryExpensePackReviewAcknowledgement,
  recordSecretaryExpenseReceipt,
  recordSecretaryExpenseReceiptUnavailable,
  reviseSecretaryExpensePack,
  startSecretaryExpensePack,
} from "@/lib/operator/secretary/SecretaryExpensePackRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: { mode: "write", risk: "medium", aliases: ["prepare my expense pack", "collect my travel receipts", "organize these expense receipts"], description: "Start a durable Secretary-owned expense receipt collection pack. Missing receipts are requested and chased through governed follow-ups without creating reimbursement, accounting, or payment authority." },
  read: { mode: "read", risk: "low", aliases: ["show my expense pack", "what receipts are missing", "show expense receipt status"], description: "Read receipt collection, exceptions, totals by currency, versions, review state, and follow-up status without changing anything." },
  addExpectedItem: { mode: "write", risk: "low", aliases: ["add an expected receipt", "add this expense receipt to collect"], description: "Add an explicit expected receipt item while the pack is collecting." },
  recordReceipt: { mode: "write", risk: "low", aliases: ["record this receipt", "add this receipt to the expense pack"], description: "Record a receipt only from explicit evidence and explicit amount/currency fields. Vendor, date, currency, amount, tax, eligibility, and accounting treatment are never invented." },
  recordUnavailable: { mode: "write", risk: "low", aliases: ["mark this receipt unavailable", "record missing receipt evidence"], description: "Record evidence that a required receipt is unavailable while preserving the missing-receipt exception for review." },
  finalize: { mode: "write", risk: "medium", aliases: ["finalize the expense pack", "finish the receipt pack"], description: "Create an immutable version snapshot with evidence-backed receipts, visible missing-receipt exceptions, and separate totals per currency without implicit FX conversion." },
  revise: { mode: "write", risk: "medium", aliases: ["revise the expense pack", "reopen the expense pack", "add late receipts to a new version"], description: "Open an evidence-backed revision while preserving earlier finalized versions and fencing stale review messages." },
  queueReview: { mode: "write", risk: "medium", aliases: ["send the expense pack for review", "send receipts to the reviewer"], description: "Queue deterministic Secretary-owned review delivery through the governed communication path. Review delivery never becomes reimbursement approval, accounting approval, posting approval, or payment authority." },
  acknowledgeReview: { mode: "write", risk: "low", aliases: ["mark the expense pack received", "record receipt of the expense pack"], description: "Record an evidence-backed acknowledgement that the reviewer received the pack. Receipt acknowledgement is not reimbursement, accounting, tax, posting, or payment approval." },
  cancel: { mode: "write", risk: "low", aliases: ["cancel the expense pack", "stop collecting these receipts"], description: "Cancel Secretary expense-pack coordination and fence its pending follow-ups without changing travel, accounting, reimbursement, or payment records." },
});

function expectedItemSchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      responsible_party_id: { type: "string" },
      receipt_required: { type: "boolean" },
      notes: { type: "string" },
    },
    required: ["description"],
    additionalProperties: false,
  };
}

function locatorProperties() {
  return {
    pack_id: { type: "string" },
    pack_reference: { type: "string" },
    trip_reference: { type: "string" },
    travel_job_id: { type: "string" },
    calendar_event_id: { type: "string" },
  };
}

function schema(action) {
  if (action === "start") return {
    type: "object",
    properties: {
      ...locatorProperties(),
      traveler_party_id: { type: "string" },
      reviewer_party_id: { type: "string" },
      purpose: { type: "string" },
      trip_start_at: { type: "string" },
      trip_end_at: { type: "string" },
      collection_deadline: { type: "string" },
      expected_items: { type: "array", maxItems: 100, items: expectedItemSchema() },
      entity_id: { type: "string" },
    },
    additionalProperties: false,
  };
  if (action === "read" || action === "cancel") return {
    type: "object",
    properties: { ...locatorProperties(), reason: { type: "string" } },
    additionalProperties: false,
  };
  if (action === "addExpectedItem") return {
    type: "object",
    properties: { ...locatorProperties(), ...expectedItemSchema().properties, item_id: { type: "string" } },
    required: ["description"],
    additionalProperties: false,
  };
  if (action === "recordReceipt") return {
    type: "object",
    properties: {
      ...locatorProperties(),
      expected_item_id: { type: "string" },
      evidence_id: { type: "string" },
      receipt_reference: { type: "string" },
      document_reference: { type: "string" },
      description: { type: "string" },
      vendor: { type: "string" },
      expense_date: { type: "string" },
      amount: { type: ["string", "number"] },
      currency: { type: "string" },
      category: { type: "string" },
      notes: { type: "string" },
    },
    required: ["evidence_id", "receipt_reference", "amount", "currency"],
    additionalProperties: false,
  };
  if (action === "recordUnavailable") return {
    type: "object",
    properties: { ...locatorProperties(), expected_item_id: { type: "string" }, evidence_id: { type: "string" }, reason: { type: "string" } },
    required: ["expected_item_id", "evidence_id", "reason"],
    additionalProperties: false,
  };
  if (action === "finalize") return {
    type: "object",
    properties: { ...locatorProperties(), allow_missing_receipts: { type: "boolean" } },
    additionalProperties: false,
  };
  if (action === "revise") return {
    type: "object",
    properties: { ...locatorProperties(), change_note: { type: "string" } },
    additionalProperties: false,
  };
  if (action === "queueReview") return {
    type: "object",
    properties: { ...locatorProperties(), reviewer_party_id: { type: "string" }, review_chase_at: { type: "string" } },
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { ...locatorProperties(), reviewer_party_id: { type: "string" }, evidence_id: { type: "string" }, acknowledged: { type: "boolean", const: true } },
    required: ["reviewer_party_id", "evidence_id", "acknowledged"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryExpensePackCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_EXPENSE_PACK_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_expense_pack",
    action,
    name: `Executive Secretary expense pack ${action}`,
    document: "secretary_expense_pack",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_expense_pack.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "expense", "receipt", "travel", "reimbursement-preparation", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.risk,
    reversible: true,
    approval: { required: false },
    inputSchema: schema(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && actorPartyId(context));
  }

  async function execute({ context, payload = {} }) {
    if (action === "start") return startSecretaryExpensePack({ context, payload });
    if (action === "read") return readSecretaryExpensePack({ context, payload });
    if (action === "addExpectedItem") return addSecretaryExpenseExpectedItem({ context, payload });
    if (action === "recordReceipt") return recordSecretaryExpenseReceipt({ context, payload });
    if (action === "recordUnavailable") return recordSecretaryExpenseReceiptUnavailable({ context, payload });
    if (action === "finalize") return finalizeSecretaryExpensePack({ context, payload });
    if (action === "revise") return reviseSecretaryExpensePack({ context, payload });
    if (action === "queueReview") return queueSecretaryExpensePackReview({ context, payload });
    if (action === "acknowledgeReview") return recordSecretaryExpensePackReviewAcknowledgement({ context, payload });
    if (action === "cancel") return cancelSecretaryExpensePack({ context, payload });
    throw new Error(`SECRETARY_EXPENSE_PACK_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryExpensePackCapability;
