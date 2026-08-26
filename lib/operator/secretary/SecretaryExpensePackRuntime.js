import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_EXPENSE_PACK_V1";
const KIND = "EXPENSE_PACK";
const MICRO_SCALE = 1_000_000n;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function packKey(payload = {}) {
  const key = text(
    payload.pack_reference || payload.packReference ||
    payload.trip_reference || payload.tripReference ||
    payload.travel_job_id || payload.travelJobId ||
    payload.calendar_event_id || payload.calendarEventId,
    600,
  );
  if (!key) throw new Error("SECRETARY_EXPENSE_PACK_REFERENCE_REQUIRED");
  return key;
}

function packTaskId(organization, key) {
  return deterministicUuid(`avantiqo-secretary-expense-pack-v1:${organization}:${key}`);
}

function expectedItemId(packId, index, description) {
  return deterministicUuid(`avantiqo-secretary-expense-expected-v1:${packId}:${index}:${description}`);
}

function adHocItemId(packId, evidenceId, receiptReference) {
  return deterministicUuid(`avantiqo-secretary-expense-adhoc-v1:${packId}:${evidenceId}:${receiptReference}`);
}

function followUpId(packId, partyId, kind, itemId, version = 0) {
  return deterministicUuid(`avantiqo-secretary-expense-follow-up-v1:${packId}:${partyId}:${kind}:${itemId || "pack"}:${version}`);
}

function parseIso(value, field, { required = false } = {}) {
  const raw = text(value, 160);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_EXPENSE_PACK_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error(`SECRETARY_EXPENSE_PACK_${field.toUpperCase()}_INVALID`);
  return new Date(ms).toISOString();
}

function normalizeCurrency(value) {
  const currency = text(value, 12).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("SECRETARY_EXPENSE_PACK_CURRENCY_REQUIRED");
  return currency;
}

function amountToMicros(value) {
  const raw = text(value, 80);
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(raw)) throw new Error("SECRETARY_EXPENSE_PACK_AMOUNT_INVALID");
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const micros = BigInt(whole) * MICRO_SCALE + BigInt(fraction.padEnd(6, "0"));
  return negative ? -micros : micros;
}

function microsToAmount(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / MICRO_SCALE;
  const fraction = String(absolute % MICRO_SCALE).padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function normalizeAmount(value) {
  return microsToAmount(amountToMicros(value));
}

function totalsByCurrency(items) {
  const totals = new Map();
  for (const item of list(items)) {
    if (item.status !== "RECEIVED" || !item.receipt?.currency || !item.receipt?.amount) continue;
    const currency = normalizeCurrency(item.receipt.currency);
    totals.set(currency, (totals.get(currency) || 0n) + amountToMicros(item.receipt.amount));
  }
  return Object.fromEntries([...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => [currency, microsToAmount(total)]));
}

function normalizeExpectedItems(value, packId, defaultPartyId) {
  return list(value).slice(0, 100).map((item, index) => {
    const row = typeof item === "string" ? { description: item } : object(item);
    const description = text(row.description || row.label || row.item, 600);
    if (!description) throw new Error(`SECRETARY_EXPENSE_PACK_EXPECTED_ITEM_DESCRIPTION_REQUIRED:${index}`);
    return {
      id: text(row.id, 120) || expectedItemId(packId, index, description),
      description,
      category: text(row.category, 120) || null,
      responsible_party_id: text(row.responsible_party_id || row.responsiblePartyId, 120) || defaultPartyId || null,
      receipt_required: row.receipt_required !== false && row.receiptRequired !== false,
      notes: text(row.notes, 1200) || null,
      status: "PENDING",
      receipt: null,
      unavailable_evidence: null,
    };
  });
}

function normalizeReceipt(payload = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  if (!evidenceId) throw new Error("SECRETARY_EXPENSE_PACK_RECEIPT_EVIDENCE_REQUIRED");
  const receiptReference = text(payload.receipt_reference || payload.receiptReference || payload.document_reference || payload.documentReference, 1200);
  if (!receiptReference) throw new Error("SECRETARY_EXPENSE_PACK_RECEIPT_REFERENCE_REQUIRED");
  const amount = normalizeAmount(payload.amount);
  const currency = normalizeCurrency(payload.currency);
  return {
    evidence_id: evidenceId,
    receipt_reference: receiptReference,
    document_reference: text(payload.document_reference || payload.documentReference, 1200) || receiptReference,
    vendor: text(payload.vendor, 500) || null,
    expense_date: parseIso(payload.expense_date || payload.expenseDate, "expense_date") || null,
    amount,
    currency,
    category: text(payload.category, 120) || null,
    notes: text(payload.notes, 1200) || null,
    recorded_at: new Date().toISOString(),
    values_explicit_not_inferred: true,
  };
}

function deadline(payload = {}) {
  const explicit = parseIso(payload.collection_deadline || payload.collectionDeadline, "collection_deadline");
  if (explicit) return { value: explicit, source: "EXPLICIT" };
  return { value: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), source: "SECRETARY_INTERNAL_DEFAULT" };
}

function chaseAt(collectionDeadline) {
  const now = Date.now();
  const end = Date.parse(collectionDeadline);
  if (!Number.isFinite(end) || end <= now + 2 * 60 * 1000) return null;
  return new Date(now + Math.max(60 * 1000, Math.floor((end - now) / 2))).toISOString();
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "MESSAGE";
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  return text(profile?.preferred_channel, 120).toLowerCase().includes("email") ? "EMAIL" : "MESSAGE";
}

async function loadPackTask(organization, payload = {}) {
  const directId = text(payload.pack_id || payload.packId, 120);
  const id = directId || packTaskId(organization, packKey(payload));
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
}

async function mutatePackTask(organization, payload, producer) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const task = await loadPackTask(organization, payload);
    if (!task) throw new Error("SECRETARY_EXPENSE_PACK_NOT_FOUND");
    const produced = await producer(task, object(task.metadata));
    const update = await supabaseAdmin.from("secretary_tasks")
      .update({
        ...object(produced.task_patch),
        metadata: produced.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) return { task: update.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_EXPENSE_PACK_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function ensureFollowUp({ task, partyId, kind, itemId = null, version = 0, dueAt, instruction }) {
  const id = followUpId(task.id, partyId, kind, itemId, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = await preferredActionType(task.organization_id, partyId);
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: partyId,
    task_id: task.id,
    calendar_event_id: task.calendar_event_id || null,
    action_type: actionType,
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: dueAt || new Date().toISOString(),
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_expense_pack: true,
      secretary_expense_pack_task_id: task.id,
      secretary_expense_pack_kind: kind,
      secretary_expense_pack_item_id: itemId,
      secretary_expense_pack_version: version,
      accounting_posting_authority_created: false,
      reimbursement_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups").select("*")
          .eq("organization_id", task.organization_id).eq("id", id).single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelPackFollowUps({ task, itemId = null, kinds = null, version = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1000),
  );
  const allowedKinds = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_expense_pack !== true) return false;
    if (itemId && metadata.secretary_expense_pack_item_id !== itemId) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.secretary_expense_pack_kind, 100))) return false;
    if (version !== null && Number(metadata.secretary_expense_pack_version) !== Number(version)) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1000), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids.length;
}

function receiptRequestInstruction(metadata, item, chase = false) {
  return [
    chase ? "Follow up once for the missing expense receipt." : "Request the missing expense receipt.",
    `Expense pack: ${text(metadata.pack_reference, 500)}.`,
    `Item: ${text(item.description, 500)}.`,
    item.category ? `Category: ${text(item.category, 120)}.` : null,
    "Ask only for the receipt or explicit evidence that it is unavailable. Do not invent vendor, date, amount, currency, tax, reimbursement eligibility, accounting treatment, or approval.",
  ].filter(Boolean).join(" ");
}

async function materializeMissingReceiptFollowUps(task) {
  const metadata = object(task.metadata);
  const ids = [];
  for (const item of list(metadata.items)) {
    if (item.receipt_required !== true || item.status !== "PENDING" || !item.responsible_party_id) continue;
    const request = await ensureFollowUp({
      task,
      partyId: item.responsible_party_id,
      kind: "RECEIPT_REQUEST",
      itemId: item.id,
      dueAt: new Date().toISOString(),
      instruction: receiptRequestInstruction(metadata, item, false),
    });
    ids.push(request.id);
    const chaseDue = chaseAt(metadata.collection_deadline);
    if (chaseDue) {
      const chase = await ensureFollowUp({
        task,
        partyId: item.responsible_party_id,
        kind: "RECEIPT_CHASE",
        itemId: item.id,
        dueAt: chaseDue,
        instruction: receiptRequestInstruction(metadata, item, true),
      });
      ids.push(chase.id);
    }
  }
  return [...new Set(ids)];
}

function packSummary(version) {
  const totals = Object.entries(object(version.totals_by_currency)).map(([currency, amount]) => `${currency} ${amount}`).join(", ") || "No monetary total";
  return [
    `Expense pack ${text(version.pack_reference, 500)}, version ${version.version}.`,
    `Receipts: ${Number(version.receipt_count || 0)}.`,
    `Totals by currency: ${totals}.`,
    list(version.missing_receipt_item_ids).length ? `Missing receipt exceptions: ${list(version.missing_receipt_item_ids).length}.` : "Missing receipt exceptions: 0.",
    "This pack is prepared for administrative review only. Receipt inclusion, totals, or review receipt do not approve reimbursement, accounting treatment, tax treatment, journal posting, or payment.",
  ].join(" ");
}

function currentMissingItems(metadata) {
  return list(metadata.items).filter((item) => item.receipt_required === true && item.status !== "RECEIVED");
}

function evidenceDuplicate(metadata, evidenceId, receiptReference) {
  for (const item of list(metadata.items)) {
    const receipt = object(item.receipt);
    if (receipt.evidence_id === evidenceId || receipt.receipt_reference === receiptReference) return item;
  }
  for (const row of list(metadata.late_receipts)) {
    const receipt = object(row.receipt);
    if (receipt.evidence_id === evidenceId || receipt.receipt_reference === receiptReference) return row;
  }
  return null;
}

export async function startSecretaryExpensePack({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const key = packKey(payload);
  const id = packTaskId(organization, key);
  let task = await one(
    supabaseAdmin.from("secretary_tasks").select("*")
      .eq("organization_id", organization).eq("id", id).maybeSingle(),
  );
  if (!task) {
    const travelerPartyId = text(payload.traveler_party_id || payload.travelerPartyId, 120) || actor;
    const deadlineInfo = deadline(payload);
    const metadata = {
      secretary_role: "EXECUTIVE_SECRETARY",
      secretary_owned: true,
      expense_pack: true,
      expense_pack_kind: KIND,
      expense_pack_contract: CONTRACT,
      expense_pack_state: "COLLECTING",
      pack_reference: key,
      trip_reference: text(payload.trip_reference || payload.tripReference, 600) || null,
      travel_job_id: text(payload.travel_job_id || payload.travelJobId, 120) || null,
      calendar_event_id: text(payload.calendar_event_id || payload.calendarEventId, 120) || null,
      traveler_party_id: travelerPartyId,
      purpose: text(payload.purpose, 1200) || null,
      trip_start_at: parseIso(payload.trip_start_at || payload.tripStartAt, "trip_start_at") || null,
      trip_end_at: parseIso(payload.trip_end_at || payload.tripEndAt, "trip_end_at") || null,
      collection_deadline: deadlineInfo.value,
      collection_deadline_source: deadlineInfo.source,
      items: normalizeExpectedItems(payload.expected_items || payload.expectedItems, id, travelerPartyId),
      late_receipts: [],
      versions: [],
      current_version: 0,
      finalized_version: null,
      reviewer_party_id: text(payload.reviewer_party_id || payload.reviewerPartyId, 120) || null,
      review_status: "NOT_QUEUED",
      review_version: null,
      review_acknowledgement_evidence_id: null,
      pending_revision: false,
      multi_currency_totals_not_converted: true,
      values_not_inferred: true,
      accounting_posting_authority_created: false,
      reimbursement_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    };
    const inserted = await supabaseAdmin.from("secretary_tasks").insert({
      id,
      organization_id: organization,
      entity_id: payload.entity_id || payload.entityId || context.entityId || null,
      owner_party_id: travelerPartyId,
      contact_party_id: travelerPartyId,
      calendar_event_id: metadata.calendar_event_id,
      title: `Prepare expense pack: ${text(key, 360)}`,
      details: `Durable Secretary-owned expense receipt collection and review preparation for ${text(key, 600)}.`,
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: deadlineInfo.value,
      remind_at: chaseAt(deadlineInfo.value),
      source: "secretary",
      created_by_party_id: actor,
      metadata,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      task = await loadPackTask(organization, { pack_id: id });
    } else task = inserted.data;
  }
  const followUpIds = object(task.metadata).expense_pack_state === "COLLECTING"
    ? await materializeMissingReceiptFollowUps(task)
    : [];
  return {
    status: "started",
    contract: CONTRACT,
    pack_id: task.id,
    task,
    missing_receipt_follow_up_ids: followUpIds,
    deterministic_pack_id: task.id === id,
    accounting_posting_authority_created: false,
    reimbursement_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function addSecretaryExpenseExpectedItem({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const changed = await mutatePackTask(organization, payload, async (task, metadata) => {
    if (metadata.expense_pack_state !== "COLLECTING") throw new Error("SECRETARY_EXPENSE_PACK_FINALIZED_REQUIRES_REVISION");
    const description = text(payload.description, 600);
    if (!description) throw new Error("SECRETARY_EXPENSE_PACK_EXPECTED_ITEM_DESCRIPTION_REQUIRED");
    const existing = list(metadata.items);
    const id = text(payload.item_id || payload.itemId, 120) || expectedItemId(task.id, existing.length, description);
    if (existing.some((item) => item.id === id)) return { metadata, output: { item_id: id, idempotent: true } };
    const item = {
      id,
      description,
      category: text(payload.category, 120) || null,
      responsible_party_id: text(payload.responsible_party_id || payload.responsiblePartyId, 120) || metadata.traveler_party_id || actor,
      receipt_required: payload.receipt_required !== false && payload.receiptRequired !== false,
      notes: text(payload.notes, 1200) || null,
      status: "PENDING",
      receipt: null,
      unavailable_evidence: null,
    };
    return { metadata: { ...metadata, items: [...existing, item] }, output: { item_id: id, idempotent: false } };
  });
  const ids = await materializeMissingReceiptFollowUps(changed.task);
  return { status: "expected_item_added", task: changed.task, ...changed.output, missing_receipt_follow_up_ids: ids, external_authority_used: false };
}

export async function recordSecretaryExpenseReceipt({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const receipt = normalizeReceipt(payload);
  const changed = await mutatePackTask(organization, payload, async (task, metadata) => {
    const duplicate = evidenceDuplicate(metadata, receipt.evidence_id, receipt.receipt_reference);
    if (duplicate) return { metadata, output: { idempotent: true, item_id: duplicate.id || duplicate.item_id } };
    const itemId = text(payload.expected_item_id || payload.expectedItemId, 120);
    let items = list(metadata.items);
    let index = itemId ? items.findIndex((item) => item.id === itemId) : -1;
    if (itemId && index < 0) throw new Error("SECRETARY_EXPENSE_PACK_EXPECTED_ITEM_NOT_FOUND");
    if (index < 0) {
      const description = text(payload.description, 600) || `Receipt: ${text(receipt.vendor || receipt.receipt_reference, 400)}`;
      const id = adHocItemId(task.id, receipt.evidence_id, receipt.receipt_reference);
      const item = {
        id,
        description,
        category: receipt.category,
        responsible_party_id: metadata.traveler_party_id || null,
        receipt_required: true,
        notes: null,
        status: "PENDING",
        receipt: null,
        unavailable_evidence: null,
      };
      items = [...items, item];
      index = items.length - 1;
    }
    if (["FINALIZED", "REVIEW_QUEUED"].includes(metadata.expense_pack_state)) {
      const late = {
        item_id: items[index].id,
        receipt,
        received_at: new Date().toISOString(),
        requires_revision: true,
      };
      return {
        metadata: {
          ...metadata,
          items,
          late_receipts: [...list(metadata.late_receipts), late].slice(-100),
          pending_revision: true,
        },
        output: { idempotent: false, item_id: items[index].id, late_receipt: true, requires_revision: true },
      };
    }
    const next = items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      status: "RECEIVED",
      receipt,
      unavailable_evidence: null,
    } : item);
    return {
      metadata: { ...metadata, items: next },
      output: { idempotent: false, item_id: items[index].id, late_receipt: false },
    };
  });
  if (!changed.output.late_receipt && !changed.output.idempotent) {
    await cancelPackFollowUps({
      task: changed.task,
      itemId: changed.output.item_id,
      kinds: ["RECEIPT_REQUEST", "RECEIPT_CHASE"],
      reason: "Expense receipt recorded with explicit evidence.",
    });
  }
  return {
    status: changed.output.idempotent ? "receipt_already_recorded" : changed.output.late_receipt ? "late_receipt_recorded" : "receipt_recorded",
    task: changed.task,
    ...changed.output,
    receipt_values_explicit_not_inferred: true,
    fx_conversion_performed: false,
    reimbursement_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryExpenseReceiptUnavailable({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  const reason = text(payload.reason, 1200);
  const itemId = text(payload.expected_item_id || payload.expectedItemId, 120);
  if (!itemId) throw new Error("SECRETARY_EXPENSE_PACK_EXPECTED_ITEM_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_EXPENSE_PACK_UNAVAILABLE_EVIDENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_EXPENSE_PACK_UNAVAILABLE_REASON_REQUIRED");
  const changed = await mutatePackTask(organization, payload, async (_task, metadata) => {
    if (metadata.expense_pack_state !== "COLLECTING") throw new Error("SECRETARY_EXPENSE_PACK_FINALIZED_REQUIRES_REVISION");
    const items = list(metadata.items);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) throw new Error("SECRETARY_EXPENSE_PACK_EXPECTED_ITEM_NOT_FOUND");
    if (items[index].unavailable_evidence?.evidence_id === evidenceId) return { metadata, output: { idempotent: true } };
    const next = items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      status: "UNAVAILABLE_RECORDED",
      unavailable_evidence: { evidence_id: evidenceId, reason, recorded_at: new Date().toISOString() },
    } : item);
    return { metadata: { ...metadata, items: next }, output: { idempotent: false } };
  });
  await cancelPackFollowUps({
    task: changed.task,
    itemId,
    kinds: ["RECEIPT_REQUEST", "RECEIPT_CHASE"],
    reason: "Receipt unavailability explicitly recorded with evidence; exception remains visible in the pack.",
  });
  return {
    status: changed.output.idempotent ? "unavailability_already_recorded" : "receipt_unavailability_recorded",
    task: changed.task,
    missing_receipt_exception_preserved: true,
    reimbursement_eligibility_not_inferred: true,
    external_authority_used: false,
  };
}

export async function finalizeSecretaryExpensePack({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const changed = await mutatePackTask(organization, payload, async (_task, metadata) => {
    if (metadata.expense_pack_state !== "COLLECTING") throw new Error("SECRETARY_EXPENSE_PACK_NOT_EDITABLE");
    const items = list(metadata.items);
    const receipts = items.filter((item) => item.status === "RECEIVED");
    if (!receipts.length) throw new Error("SECRETARY_EXPENSE_PACK_NO_RECEIPTS");
    const missing = currentMissingItems(metadata);
    const allowMissing = payload.allow_missing_receipts === true || payload.allowMissingReceipts === true;
    if (missing.length && !allowMissing) throw new Error("SECRETARY_EXPENSE_PACK_MISSING_RECEIPTS");
    const version = Number(metadata.current_version || 0) + 1;
    const snapshot = {
      version,
      pack_reference: metadata.pack_reference,
      finalized_at: new Date().toISOString(),
      finalized_by_party_id: actor,
      items,
      receipt_count: receipts.length,
      missing_receipt_item_ids: missing.map((item) => item.id),
      totals_by_currency: totalsByCurrency(items),
      multi_currency_totals_not_converted: true,
      review_ready: missing.length === 0,
      review_ready_with_exceptions: missing.length > 0,
      reimbursement_eligibility_not_determined: true,
      accounting_treatment_not_determined: true,
      payment_authority_created: false,
    };
    return {
      metadata: {
        ...metadata,
        expense_pack_state: "FINALIZED",
        current_version: version,
        finalized_version: version,
        versions: [...list(metadata.versions), snapshot].slice(-20),
        pending_revision: false,
        review_status: "NOT_QUEUED",
        review_version: null,
        accounting_posting_authority_created: false,
        reimbursement_authority_created: false,
        payment_authority_created: false,
        external_authority_used: false,
      },
      output: { snapshot },
    };
  });
  await cancelPackFollowUps({
    task: changed.task,
    kinds: ["RECEIPT_REQUEST", "RECEIPT_CHASE"],
    reason: "Expense pack finalized; unresolved receipt exceptions are preserved in the immutable version snapshot.",
  });
  return {
    status: "finalized",
    task: changed.task,
    version: changed.output.snapshot,
    fx_conversion_performed: false,
    reimbursement_authority_created: false,
    accounting_posting_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function reviseSecretaryExpensePack({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const changed = await mutatePackTask(organization, payload, async (_task, metadata) => {
    if (!["FINALIZED", "REVIEW_QUEUED"].includes(metadata.expense_pack_state)) throw new Error("SECRETARY_EXPENSE_PACK_REVISION_REQUIRES_FINALIZED_PACK");
    let items = list(metadata.items);
    for (const late of list(metadata.late_receipts)) {
      const index = items.findIndex((item) => item.id === late.item_id);
      if (index >= 0) items = items.map((item, itemIndex) => itemIndex === index ? { ...item, status: "RECEIVED", receipt: late.receipt, unavailable_evidence: null } : item);
      else items = [...items, {
        id: late.item_id,
        description: `Late receipt: ${text(late.receipt?.vendor || late.receipt?.receipt_reference, 400)}`,
        category: late.receipt?.category || null,
        responsible_party_id: metadata.traveler_party_id || null,
        receipt_required: true,
        notes: null,
        status: "RECEIVED",
        receipt: late.receipt,
        unavailable_evidence: null,
      }];
    }
    return {
      metadata: {
        ...metadata,
        expense_pack_state: "COLLECTING",
        items,
        revision_from_version: metadata.finalized_version,
        revision_change_note: text(payload.change_note || payload.changeNote, 1200) || "Expense pack reopened for evidence-backed revision.",
        pending_revision: false,
        review_status: "NOT_QUEUED",
        review_version: null,
        accounting_posting_authority_created: false,
        reimbursement_authority_created: false,
        payment_authority_created: false,
        external_authority_used: false,
      },
    };
  });
  await cancelPackFollowUps({
    task: changed.task,
    kinds: ["EXPENSE_PACK_REVIEW", "EXPENSE_PACK_REVIEW_RECEIPT_CHASE"],
    reason: "Expense pack revision opened; stale review messages for the superseded version were fenced.",
  });
  const missingIds = await materializeMissingReceiptFollowUps(changed.task);
  return {
    status: "revision_opened",
    task: changed.task,
    missing_receipt_follow_up_ids: missingIds,
    prior_versions_preserved: true,
    stale_review_fenced: true,
    external_authority_used: false,
  };
}

export async function queueSecretaryExpensePackReview({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadPackTask(organization, payload);
  if (!task) throw new Error("SECRETARY_EXPENSE_PACK_NOT_FOUND");
  const metadata = object(task.metadata);
  if (metadata.expense_pack_state !== "FINALIZED" && metadata.expense_pack_state !== "REVIEW_QUEUED") throw new Error("SECRETARY_EXPENSE_PACK_REVIEW_REQUIRES_FINALIZED_PACK");
  const versionNumber = Number(metadata.finalized_version || 0);
  const version = list(metadata.versions).find((row) => Number(row.version) === versionNumber);
  if (!version) throw new Error("SECRETARY_EXPENSE_PACK_FINALIZED_VERSION_NOT_FOUND");
  const reviewerPartyId = text(payload.reviewer_party_id || payload.reviewerPartyId || metadata.reviewer_party_id, 120);
  if (!reviewerPartyId) throw new Error("SECRETARY_EXPENSE_PACK_REVIEWER_PARTY_REQUIRED");
  const review = await ensureFollowUp({
    task,
    partyId: reviewerPartyId,
    kind: "EXPENSE_PACK_REVIEW",
    itemId: null,
    version: versionNumber,
    dueAt: new Date().toISOString(),
    instruction: packSummary(version),
  });
  const chaseDue = parseIso(payload.review_chase_at || payload.reviewChaseAt, "review_chase_at") || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const chase = await ensureFollowUp({
    task,
    partyId: reviewerPartyId,
    kind: "EXPENSE_PACK_REVIEW_RECEIPT_CHASE",
    itemId: null,
    version: versionNumber,
    dueAt: chaseDue,
    instruction: `Follow up once to confirm only receipt of expense pack ${text(metadata.pack_reference, 500)}, version ${versionNumber}. Do not ask for or infer reimbursement approval, accounting approval, tax approval, journal posting approval, or payment authority.`,
  });
  const changed = await mutatePackTask(organization, { pack_id: task.id }, async (_current, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      expense_pack_state: "REVIEW_QUEUED",
      reviewer_party_id: reviewerPartyId,
      review_status: "QUEUED",
      review_version: versionNumber,
      review_follow_up_ids: [review.id, chase.id],
      review_delivery_not_inferred: true,
      accounting_posting_authority_created: false,
      reimbursement_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    },
  }));
  return {
    status: "review_queued",
    task: changed.task,
    follow_up_ids: [review.id, chase.id],
    review_is_not_reimbursement_approval: true,
    review_is_not_accounting_posting_approval: true,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryExpensePackReviewAcknowledgement({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  if (!evidenceId) throw new Error("SECRETARY_EXPENSE_PACK_REVIEW_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED");
  if (payload.acknowledged !== true) throw new Error("SECRETARY_EXPENSE_PACK_REVIEW_ACKNOWLEDGED_TRUE_REQUIRED");
  const current = await loadPackTask(organization, payload);
  if (!current) throw new Error("SECRETARY_EXPENSE_PACK_NOT_FOUND");
  const metadata = object(current.metadata);
  if (metadata.review_status !== "QUEUED") throw new Error("SECRETARY_EXPENSE_PACK_REVIEW_NOT_QUEUED");
  const reviewer = text(payload.reviewer_party_id || payload.reviewerPartyId, 120);
  if (!reviewer || reviewer !== metadata.reviewer_party_id) throw new Error("SECRETARY_EXPENSE_PACK_REVIEWER_PARTY_MISMATCH");
  if (metadata.review_acknowledgement_evidence_id === evidenceId) {
    return { status: "review_acknowledgement_already_recorded", task: current, idempotent: true, reimbursement_approval_not_inferred: true, external_authority_used: false };
  }
  const version = Number(metadata.review_version || 0);
  const changed = await mutatePackTask(organization, { pack_id: current.id }, async (_task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      review_status: "RECEIPT_ACKNOWLEDGED",
      review_acknowledgement_evidence_id: evidenceId,
      review_acknowledged_at: new Date().toISOString(),
      reimbursement_approval_not_inferred: true,
      accounting_approval_not_inferred: true,
      payment_approval_not_inferred: true,
      external_authority_used: false,
    },
  }));
  await cancelPackFollowUps({
    task: changed.task,
    kinds: ["EXPENSE_PACK_REVIEW_RECEIPT_CHASE"],
    version,
    reason: "Administrative receipt of the expense pack was explicitly acknowledged with evidence.",
  });
  return {
    status: "review_receipt_acknowledged",
    task: changed.task,
    acknowledgement_is_not_reimbursement_approval: true,
    acknowledgement_is_not_accounting_approval: true,
    acknowledgement_is_not_payment_approval: true,
    external_authority_used: false,
  };
}

export async function cancelSecretaryExpensePack({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const current = await loadPackTask(organization, payload);
  if (!current) throw new Error("SECRETARY_EXPENSE_PACK_NOT_FOUND");
  if (object(current.metadata).expense_pack_state === "CANCELLED") return { status: "already_cancelled", task: current, idempotent: true, external_authority_used: false };
  await cancelPackFollowUps({ task: current, reason: text(payload.reason, 1000) || "Expense pack cancelled." });
  const now = new Date().toISOString();
  const changed = await mutatePackTask(organization, { pack_id: current.id }, async (_task, metadata) => ({
    metadata: {
      ...metadata,
      expense_pack_state: "CANCELLED",
      cancelled_at: now,
      cancellation_reason: text(payload.reason, 1000) || "Expense pack cancelled.",
      accounting_posting_authority_created: false,
      reimbursement_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    },
    task_patch: { status: "CANCELLED", completed_at: now },
  }));
  return { status: "cancelled", task: changed.task, reimbursement_authority_created: false, payment_authority_created: false, external_authority_used: false };
}

export async function readSecretaryExpensePack({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadPackTask(organization, payload);
  if (!task) throw new Error("SECRETARY_EXPENSE_PACK_NOT_FOUND");
  const metadata = object(task.metadata);
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,due_at,result,metadata")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .limit(1000),
  );
  const missing = currentMissingItems(metadata);
  const received = list(metadata.items).filter((item) => item.status === "RECEIVED");
  return {
    status: "read",
    contract: CONTRACT,
    pack_id: task.id,
    task,
    pack_reference: metadata.pack_reference,
    expense_pack_state: metadata.expense_pack_state,
    items: list(metadata.items),
    late_receipts: list(metadata.late_receipts),
    versions: list(metadata.versions),
    current_version: Number(metadata.current_version || 0),
    totals_by_currency_current: totalsByCurrency(list(metadata.items)),
    receipt_count: received.length,
    missing_receipt_item_ids: missing.map((item) => item.id),
    pending_revision: metadata.pending_revision === true,
    review_status: metadata.review_status,
    review_version: metadata.review_version,
    follow_ups: followUps,
    multi_currency_totals_not_converted: true,
    values_not_inferred: true,
    reimbursement_eligibility_not_inferred: true,
    accounting_treatment_not_inferred: true,
    accounting_posting_authority_created: false,
    reimbursement_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  start: startSecretaryExpensePack,
  read: readSecretaryExpensePack,
  addExpectedItem: addSecretaryExpenseExpectedItem,
  recordReceipt: recordSecretaryExpenseReceipt,
  recordUnavailable: recordSecretaryExpenseReceiptUnavailable,
  finalize: finalizeSecretaryExpensePack,
  revise: reviseSecretaryExpensePack,
  queueReview: queueSecretaryExpensePackReview,
  acknowledgeReview: recordSecretaryExpensePackReviewAcknowledgement,
  cancel: cancelSecretaryExpensePack,
});
