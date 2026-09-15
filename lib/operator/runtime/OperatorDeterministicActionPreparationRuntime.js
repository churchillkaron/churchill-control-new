import { findCustomerIdentityMatches } from "@/lib/commercial/customers/CustomerService";

const CONTRACT = "AVANTIQO_OPERATOR_DETERMINISTIC_ACTION_PREPARATION_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isoDateInTimezone(timezone = "Asia/Bangkok") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function moneyFromMessage(message) {
  const source = text(message).replace(/,/g, "");
  const match = source.match(/(?:thb|฿)?\s*(\d+(?:\.\d{1,2})?)\s*(?:thb|baht|฿)?/i);
  return match ? Number(match[1]) : null;
}

function currencyFromMessage(message) {
  if (/\b(?:thb|baht)\b|฿/i.test(text(message))) return "THB";
  const match = text(message).match(/\b(USD|EUR|GBP|SEK|NOK|DKK|SGD|AUD|JPY|CNY|HKD)\b/i);
  return match ? match[1].toUpperCase() : null;
}
function customerNameFromMessage(message) {
  const source = text(message);
  const match = source.match(/\bfor\s+(.+?)(?=\s+for\s+(?:thb|฿|\d)|\s+dated\b|\s+due\b|\s+with\s+one\s+line\b|\s+with\s+a\s+line\b|$)/i);
  return text(match?.[1], 240) || null;
}

function lineDescriptionFromMessage(message) {
  const source = text(message);
  const match = source.match(/(?:one\s+line|a\s+line|line)\s*:\s*(.+)$/i);
  return text(match?.[1], 800) || "Customer invoice";
}

async function prepareCustomerInvoice({ message, organizationId, timezone }) {
  const customerName = customerNameFromMessage(message);
  const amount = moneyFromMessage(message);
  const currency = currencyFromMessage(message) || "THB";
  const today = isoDateInTimezone(timezone);
  if (!customerName || !Number.isFinite(amount) || amount <= 0) return null;

  const customers = await findCustomerIdentityMatches({ organizationId, name: customerName, limit: 12 });
  const exact = customers.filter((row) =>
    [row.display_name, row.customer_name, row.legal_name, row.name]
      .some((value) => text(value, 240).toLowerCase() === customerName.toLowerCase())
  );
  if (exact.length !== 1) {
    return {
      clarification_required: true,
      question: exact.length > 1
        ? `I found more than one exact customer named ${customerName}. Which customer should I use?`
        : `I could not match ${customerName} to one current customer. Which customer should I use?`,
    };
  }
  const customer = exact[0];
  return {
    clarification_required: false,
    payload: {
      party_id: customer.party_id || customer.id,
      invoice_date: /\btoday\b/i.test(text(message)) ? today : today,
      due_date: /\bdue\s+today\b/i.test(text(message)) ? today : today,
      currency_code: currency,
      exchange_rate: 1,
      lines: [{
        description: lineDescriptionFromMessage(message),
        quantity: 1,
        unit_price: amount,
        line_total: amount,
      }],
      notes: /\btest\b/i.test(text(message))
        ? `Business Partner acceptance test requested in chat on ${today}.`
        : undefined,
    },
    resolved_entities: {
      customer_party_id: customer.party_id || customer.id,
      customer_name: customer.display_name || customer.customer_name || customer.name || customerName,
    },
  };
}

export async function prepareDeterministicGovernedAction({
  semanticUnderstanding = {}, message, organizationId, entityId = null,
  timezone = "Asia/Bangkok", projectState = {}, agreementState = {}, locale = null,
} = {}) {
  const capabilityKey = text(object(semanticUnderstanding).deterministic_capability_key, 300);
  if (!capabilityKey) return null;

  let prepared = null;
  if (capabilityKey === "finance.accounts_receivable.CreateCustomerInvoice") {
    prepared = await prepareCustomerInvoice({ message, organizationId, timezone });
  }
  if (!prepared) return null;

  if (prepared.clarification_required) {
    return {
      contract: CONTRACT,
      decision: {
        response_text: prepared.question,
        response_language: text(locale, 80) || null,
        intent: "clarify",
        confidence: 1,
        agreement_state: object(agreementState),
        project_state: object(projectState),
        clarification: { required: true, question: prepared.question, options: [] },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: [],
      },
      provider_evidence: { provider: "avantiqo-local", model: "deterministic-action-preparation-v1", usage_id: null },
    };
  }
  const resolvedName = text(prepared.resolved_entities?.customer_name, 240) || "the selected customer";
  return {
    contract: CONTRACT,
    decision: {
      response_text: `I prepared the exact governed invoice for ${resolvedName}. I have not created it yet; confirmation is still required.`,
      response_language: text(locale, 80) || null,
      intent: "execute",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: object(projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: {
        capability_key: capabilityKey,
        payload: prepared.payload,
        reason: `Create the requested customer invoice for ${resolvedName}.`,
      },
      plan: [],
    },
    provider_evidence: {
      provider: "avantiqo-local",
      model: "deterministic-action-preparation-v1",
      usage_id: null,
      contract: CONTRACT,
      resolved_entities: prepared.resolved_entities,
      authorization_effect: "NONE",
    },
  };
}

export const OperatorDeterministicActionPreparationRuntime = Object.freeze({
  contract: CONTRACT,
  prepare: prepareDeterministicGovernedAction,
});
