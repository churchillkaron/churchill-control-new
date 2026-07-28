import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const FINANCE_DOCUMENT_SEQUENCE_TYPES = Object.freeze([
  "CUSTOMER_INVOICE",
  "CUSTOMER_CREDIT_NOTE",
  "CUSTOMER_PAYMENT",
  "PAYMENT_RECEIPT",
  "VENDOR_PAYMENT",
  "PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "JOURNAL_ENTRY",
  "OPENING_BALANCE",
  "BANK_STATEMENT",
  "BANK_RECONCILIATION",
  "DEPRECIATION_RUN",
  "FX_REVALUATION",
  "VAT_RETURN",
  "STATUTORY_FILING",
  "INTERCOMPANY_DOCUMENT",
]);

const DOCUMENT_TYPES = new Set(FINANCE_DOCUMENT_SEQUENCE_TYPES);
const RESET_POLICIES = new Set(["NEVER", "YEARLY", "MONTHLY"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeKey(value) {
  const cleaned = cleanText(value);
  return typeof cleaned === "string" ? cleaned.toUpperCase() : cleaned;
}

function positiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${field} must be a whole number between 1 and ${maximum}`);
  }

  return number;
}

export function normalizeNumberSequencePayload(payload) {
  const normalized = { ...(payload || {}) };

  if (Object.prototype.hasOwnProperty.call(normalized, "document_type")) {
    normalized.document_type = normalizeKey(normalized.document_type);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "prefix")) {
    normalized.prefix = cleanText(normalized.prefix) || null;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "suffix")) {
    normalized.suffix = cleanText(normalized.suffix) || null;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "reset_policy")) {
    normalized.reset_policy = normalizeKey(normalized.reset_policy);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "next_number")) {
    normalized.next_number = Number(normalized.next_number);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "padding")) {
    normalized.padding = Number(normalized.padding);
  }

  return normalized;
}

function validateAffix(value, field) {
  if (!value) return;

  if (String(value).length > 32) {
    throw new Error(`${field} must not exceed 32 characters`);
  }

  if (/\p{C}/u.test(String(value))) {
    throw new Error(`${field} contains unsupported control characters`);
  }
}

async function loadSequence({ organizationId, recordId }) {
  const { data, error } = await supabaseAdmin
    .from("finance_number_sequences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", recordId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Number Sequence not found");

  return data;
}

async function assertNoScopeChangeAfterUse({
  organizationId,
  existing,
  candidate,
}) {
  const scopeChanged =
    existing.entity_id !== candidate.entity_id ||
    normalizeKey(existing.document_type) !== candidate.document_type;

  if (!scopeChanged) return;

  const aliases = [normalizeKey(existing.document_type)];
  if (aliases[0] === "CUSTOMER_INVOICE") aliases.push("INVOICE");

  const { data, error } = await supabaseAdmin
    .from("document_number_sequences")
    .select("id, document_type")
    .eq("organization_id", organizationId)
    .eq("entity_id", existing.entity_id)
    .limit(250);

  if (error) throw error;

  const hasAllocatedNumbers = (data || []).some((row) =>
    aliases.includes(normalizeKey(row.document_type))
  );

  if (hasAllocatedNumbers) {
    throw new Error(
      "Legal Entity and Document Type must not change after numbers have been allocated"
    );
  }
}

export async function validateNumberSequenceWrite({
  organizationId,
  payload,
  recordId = null,
}) {
  let existing = null;
  let candidate = normalizeNumberSequencePayload(payload);

  if (recordId) {
    existing = await loadSequence({ organizationId, recordId });
    candidate = normalizeNumberSequencePayload({ ...existing, ...candidate });
  }

  Object.assign(payload, normalizeNumberSequencePayload(payload));

  if (!candidate.entity_id) throw new Error("Legal Entity required");
  if (!DOCUMENT_TYPES.has(candidate.document_type)) {
    throw new Error("Document Type is not supported");
  }
  if (!candidate.prefix) throw new Error("Prefix required");
  if (!RESET_POLICIES.has(candidate.reset_policy)) {
    throw new Error("Reset Policy is not supported");
  }

  validateAffix(candidate.prefix, "Prefix");
  validateAffix(candidate.suffix, "Suffix");

  candidate.next_number = positiveInteger(candidate.next_number, "Next Number");
  candidate.padding = positiveInteger(candidate.padding, "Padding", 20);

  payload.next_number = candidate.next_number;
  payload.padding = candidate.padding;

  if (existing && candidate.next_number < Number(existing.next_number || 1)) {
    throw new Error("Next Number must not be lower than the current sequence value");
  }

  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", candidate.entity_id)
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity) throw new Error("Legal Entity not found in this organisation");

  if (existing) {
    await assertNoScopeChangeAfterUse({
      organizationId,
      existing,
      candidate,
    });
  }

  let duplicateQuery = supabaseAdmin
    .from("finance_number_sequences")
    .select("id, document_type")
    .eq("organization_id", organizationId)
    .eq("entity_id", candidate.entity_id);

  if (recordId) duplicateQuery = duplicateQuery.neq("id", recordId);

  const { data: possibleDuplicates, error: duplicateError } =
    await duplicateQuery;

  if (duplicateError) throw duplicateError;

  const duplicate = (possibleDuplicates || []).find(
    (row) => normalizeKey(row.document_type) === candidate.document_type
  );

  if (duplicate) {
    throw new Error(
      "A Number Sequence already exists for this Legal Entity and Document Type"
    );
  }
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function decorateNumberSequenceRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const documentLabel = titleCase(row.document_type || "Document");
    const prefix = String(row.prefix || "");
    const suffix = String(row.suffix || "");
    const padding = Math.max(1, Math.min(20, Number(row.padding || 4)));
    const nextNumber = Math.max(1, Number(row.next_number || 1));
    const resetPolicy = normalizeKey(row.reset_policy) || "NEVER";
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const period =
      resetPolicy === "MONTHLY"
        ? `${year.slice(-2)}${month}`
        : resetPolicy === "YEARLY"
          ? year.slice(-2)
          : "";
    const separator = prefix && !/[-/_]$/.test(prefix) ? "-" : "";
    const preview = `${prefix}${separator}${period}${String(nextNumber).padStart(
      padding,
      "0"
    )}${suffix}`;

    return {
      ...row,
      name: documentLabel,
      title: `${documentLabel} Number Sequence`,
      code: preview,
      document_label: documentLabel,
      next_number_preview: preview,
    };
  });
}
