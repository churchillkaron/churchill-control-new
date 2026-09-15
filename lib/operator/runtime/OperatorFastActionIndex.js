function action({
  key, domain, capability, action: actionName, name, description, aliases = [],
  permissions = [], scope = "organization", risk = "medium", transactional = true,
  autoExecute = false, requiresConfirmation = true, reversible = false,
  verification = null,
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
    input_schema: { type: "object", properties: {}, additionalProperties: true },
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
      "issue invoice", "bill customer",
    ],
    permissions: ["finance.receivables.manage"],
    scope: "entity",
    risk: "high",
    transactional: true,
    autoExecute: false,
    requiresConfirmation: true,
    reversible: false,
    verification: {
      capability_key: "finance.customer_invoices.read",
      payload_from_result: {
        id: ["invoice.id", "customer_invoice.id", "invoice_id", "invoiceId", "id"],
      },
      derivation: "declared_result_bound_record_verifier",
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
