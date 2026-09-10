import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { normalizeBankStatementAttachment } from "./BankStatementAttachmentNormalizer";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalize(value) {
  return text(value, 500).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function digits(value) { return text(value, 200).replace(/\D/g, ""); }
function evidenceValues(file = {}) {
  const evidence = object(file?.analysis?.evidence);
  const fields = object(evidence.fields);
  return {
    bank_name: text(evidence.bank_name || fields.BANK || fields.BANK_NAME || fields["BANK NAME"], 300),
    account_name: text(evidence.account_name || fields.ACCOUNT_NAME || fields["ACCOUNT NAME"], 300),
    account_number: text(evidence.account_number || fields.ACCOUNT_NUMBER || fields["ACCOUNT NUMBER"], 200),
  };
}

function accountScore(account, evidence) {
  let score = 0;
  const evidenceNumber = digits(evidence.account_number);
  const accountNumber = digits(account.account_number);
  if (evidenceNumber && accountNumber) {
    if (evidenceNumber === accountNumber) score += 100;
    else if (evidenceNumber.length >= 4 && accountNumber.endsWith(evidenceNumber.slice(-4))) score += 70;
  }
  const bank = normalize(evidence.bank_name);
  if (bank && normalize(account.bank_name).includes(bank)) score += 30;
  const name = normalize(evidence.account_name);
  if (name && normalize(account.account_name) === name) score += 40;
  return score;
}
async function scopedBankAccounts({ organizationId, entityId }) {
  let query = supabaseAdmin
    .from("bank_accounts")
    .select("id,bank_name,account_name,account_number,currency_code,currency,active,is_default")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query.order("is_default", { ascending: false });
  if (error) throw error;
  return data || [];
}

function clarification(candidate, accounts) {
  const missing = candidate.missing_fields || [];
  if (missing.length) {
    return `I recognized this as a bank statement, but I still need ${missing.join(", ").replaceAll("_", " ")} before I can prepare the import.`;
  }
  if (!accounts.length) {
    return "I recognized this as a bank statement, but I cannot match it to an active bank account for this legal entity. Which account does it belong to?";
  }
  return "I recognized this as a bank statement, but the account details do not uniquely match an active bank account. Which bank account does it belong to?";
}

export async function prepareBankStatementAttachment({ file = {}, organizationId, entityId } = {}) {
  const normalized = normalizeBankStatementAttachment(file);
  if (normalized.recognized !== true) return normalized;
  const accounts = await scopedBankAccounts({ organizationId, entityId });
  const evidence = evidenceValues(file);
  const ranked = accounts
    .map((account) => ({ account, score: accountScore(account, evidence) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0] && (!ranked[1] || ranked[0].score > ranked[1].score)
    ? ranked[0]
    : null;
  const statement = { ...normalized.statement };
  if (!statement.currency_code && winner?.account) {
    statement.currency_code = text(winner.account.currency_code || winner.account.currency, 20).toUpperCase() || null;
  }
  const remainingMissing = (normalized.missing_fields || []).filter((field) => !(field === "currency_code" && statement.currency_code));
  const ready = Boolean(winner && remainingMissing.length === 0);
  return {
    ...normalized,
    status: ready ? "READY_FOR_REVIEW" : "CLARIFICATION_REQUIRED",
    statement,
    bank_account: winner ? {
      id: winner.account.id,
      bank_name: winner.account.bank_name || null,
      account_name: winner.account.account_name || null,
      account_number_last4: digits(winner.account.account_number).slice(-4) || null,
      match_score: winner.score,
    } : null,
    bank_account_id: winner?.account?.id || null,
    missing_fields: remainingMissing,
    clarification_required: !ready,
    clarification_question: ready ? null : clarification({ ...normalized, missing_fields: remainingMissing }, accounts),
    import_payload: ready ? {
      entity_id: entityId,
      bank_account_id: winner.account.id,
      ...statement,
      import_reference: normalized.source_attachment_sha256
        ? `BUSINESS-PARTNER-ATTACHMENT:${normalized.source_attachment_sha256}`
        : null,
    } : null,
    authorization_effect: "NONE",
  };
}

export default prepareBankStatementAttachment;
