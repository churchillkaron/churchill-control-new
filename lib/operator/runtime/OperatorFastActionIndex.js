function action({
  key, domain, capability, action: actionName, name, description, aliases = [],
  permissions = [], scope = "organization", risk = "medium", transactional = true,
  autoExecute = false, requiresConfirmation = true, reversible = false,
  verification = null, preparationReads = [], inputSchema = null,
}) {
  return Object.freeze({
    key,
    domain,
    capability,
    action: actionName,
    name,
    description,
    operator_aliases: aliases,
    operator_examples: aliases,
    permissions,
    events: [],
    tags: [domain, capability, "fast-action-index"],
    context_scope: scope,
    input_schema: inputSchema || { type: "object", properties: {}, additionalProperties: true },
    output_schema: { type: "object", additionalProperties: true },
    mode: "write",
    risk,
    approval: null,
    reversible,
    transactional,
    auto_execute: autoExecute,
    requires_confirmation: requiresConfirmation,
    ai_enabled: true,
    operator_enabled: true,
    operator_verification: verification,
    operator_verification_status: verification ? "EXPLICIT_VALID" : "NONE",
    operator_preparation_reads: Object.freeze(preparationReads.map((item) => Object.freeze({ ...item }))),
  });
}

export const OPERATOR_FAST_ACTION_INDEX = Object.freeze([
  action({
    key: "finance.accounts_receivable.CreateCustomerInvoice",
    domain: "finance",
    capability: "accounts_receivable",
    action: "CreateCustomerInvoice",
    name: "Create customer invoice",
    description: "Create a customer invoice through the canonical Finance accounts receivable application service, including an inline new customer when supplied.",
    aliases: [
      "create invoice", "create an invoice", "create customer invoice",
      "create a customer invoice", "make invoice", "make an invoice",
      "issue invoice", "bill customer", "copy invoice", "copy latest invoice",
      "copy the latest invoice", "duplicate invoice", "duplicate latest invoice",
    ],
    permissions: ["finance.receivables.manage"],
    scope: "entity",
    risk: "high",
    transactional: true,
    autoExecute: false,
    requiresConfirmation: true,
    reversible: false,
    preparationReads: [
      { capability_key: "commercial.customers.read", payload: { limit: 200 }, purpose: "Resolve the customer from current customer records." },
      { capability_key: "finance.customer_invoices.read", payload: { include_lines: true, limit: 100 }, purpose: "Load recent customer invoices and line details when the request refers to prior invoice content." },
    ],
    inputSchema: {
      type: "object",
      properties: {
        party_id: { type: "string", description: "Existing customer party id." },
        customer: { type: "object", description: "Inline new customer details when party_id is not known." },
        invoice_date: { type: "string" },
        due_date: { type: "string" },
        currency_code: { type: "string" },
        exchange_rate: { type: "number" },
        lines: { type: "array", items: { type: "object" } },
        notes: { type: "string" },
      },
      additionalProperties: true,
    },
    verification: {
      capability_key: "finance.customer_invoices.read",
      payload_from_result: {
        id: ["invoice.id", "customer_invoice.id", "invoice_id", "invoiceId", "id"],
      },
      derivation: "declared_result_bound_record_verifier",
    },
  }),
  action({
    key: "finance.accounts_receivable.CorrectCustomerInvoice",
    domain: "finance",
    capability: "accounts_receivable",
    action: "CorrectCustomerInvoice",
    name: "Correct customer invoice",
    description: "Correct a posted unpaid customer invoice by crediting the source invoice and creating a verified replacement invoice.",
    aliases: [
      "correct invoice", "correct customer invoice", "change invoice",
      "fix invoice", "replace invoice", "revise invoice",
    ],
    permissions: ["finance.receivables.manage"],
    scope: "entity",
    risk: "high",
    transactional: false,
    autoExecute: false,
    requiresConfirmation: true,
    reversible: false,
    preparationReads: [
      { capability_key: "finance.customer_invoices.read", payload: { include_lines: true, limit: 100 }, purpose: "Resolve the exact source invoice and current line details before correction." },
    ],
    inputSchema: {
      type: "object",
      required: ["source_invoice_id", "replacement"],
      properties: {
        source_invoice_id: { type: "string" },
        reason: { type: "string" },
        correction_date: { type: "string" },
        replacement: {
          type: "object",
          required: ["invoice_date", "due_date", "lines"],
          properties: {
            invoice_date: { type: "string" },
            due_date: { type: "string" },
            lines: { type: "array", items: { type: "object" } },
            notes: { type: "string" },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
    verification: {
      capability_key: "finance.customer_invoices.read",
      payload_from_result: {
        id: ["replacement.invoice.id", "replacement.invoice_id", "replacement.id"],
      },
      derivation: "declared_result_bound_corrected_invoice_verifier",
    },
  }),
]);

export function listOperatorFastActions() {
  return [...OPERATOR_FAST_ACTION_INDEX];
}

export function findOperatorFastAction(key) {
  const target = String(key ?? "").trim();
  return target ? OPERATOR_FAST_ACTION_INDEX.find((item) => item.key === target) || null : null;
}
