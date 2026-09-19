import { createHash } from "node:crypto";

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

import {
  createCustomerInvoiceCommand,
} from "../runtime/AccountsReceivableApplicationService";

import {
  mapCustomerInvoiceFormPayload,
} from "../mappers/customerInvoiceMapper";

import {
  upsertCustomerParty,
} from "@/lib/commercial/customers/CustomerService";

function text(value) {
  return String(value ?? "").trim();
}

function stableInvoiceIdempotencyKey({ context = {}, payload = {}, partyId = null } = {}) {
  const supplied = text(payload.idempotency_key);
  if (supplied) return supplied;
  const material = JSON.stringify({
    organization_id: text(context.organizationId),
    entity_id: text(context.entityId),
    party_id: text(partyId),
    invoice_date: text(payload.invoice_date),
    due_date: text(payload.due_date),
    currency_code: text(payload.currency_code).toUpperCase(),
    lines: Array.isArray(payload.lines) ? payload.lines : [],
  });
  return `business-partner-customer-invoice:${createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function createdInvoiceId(result = {}) {
  return text(
    result?.invoice?.id ||
    result?.customer_invoice?.id ||
    result?.invoice_id ||
    result?.invoiceId ||
    result?.id,
  ) || null;
}

function invoiceArtifactUrls({ invoiceId, organizationId, entityId }) {
  if (!invoiceId || !organizationId) return null;
  const query = new URLSearchParams({ organizationId });
  if (entityId) query.set("entityId", entityId);
  const previewUrl = `/api/finance/customer-invoices/${encodeURIComponent(invoiceId)}/pdf?${query.toString()}`;
  return {
    title: "Customer invoice PDF",
    mime_type: "application/pdf",
    preview_url: previewUrl,
    pdf_url: previewUrl,
    download_url: `${previewUrl}&download=1`,
  };
}

export const manifest = defineCapability({
  domain: "finance",
  capability: "accounts_receivable",
  action: "CreateCustomerInvoice",
  name: "Create customer invoice",
  document: "CustomerInvoice",
  description:
    "Create a customer invoice through the canonical Finance accounts receivable application service, including an inline new customer when supplied.",
  permissions: ["finance.receivables.manage"],
  events: ["finance.customer_invoice.created"],
  tags: ["finance", "accounts-receivable", "customer", "invoice", "billing", "write"],
  operatorAliases: [
    "create invoice",
    "create an invoice",
    "create customer invoice",
    "create a customer invoice",
    "make invoice",
    "make an invoice",
    "issue invoice",
    "bill customer",
  ],
  operatorExamples: [
    "Create an invoice for this customer.",
    "Make a customer invoice for Moonshine.",
    "Issue the approved invoice now.",
  ],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  contextScope: "entity",
  risk: "high",
  reversible: false,
  operatorVerification: {
    capability_key: "finance.customer_invoices.read",
    payload_from_result: { id: ["invoice.id", "customer_invoice.id", "invoice_id", "invoiceId", "id"] },
    derivation: "declared_result_bound_record_verifier",
  },
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
  outputSchema: { type: "object", additionalProperties: true },
});

export function authorize({ context }) {
  return requireExecutionPermission(context, "finance.receivables.manage");
}

export async function execute({
  context,
  payload = {},
}) {

  let partyId =
    payload.party_id || null;

  if (!partyId && payload.customer) {
    const customer = await upsertCustomerParty({
      access: context.access || context,
      body: payload.customer,
      organizationId: context.organizationId,
    });
    partyId = customer.party_id;
  }

  if (!partyId) {
    throw new Error("customer party required");
  }

  const invoicePayload = mapCustomerInvoiceFormPayload({
    payload: {
      ...payload,
      idempotency_key: stableInvoiceIdempotencyKey({ context, payload, partyId }),
    },
    partyId,
  });

  const result = await createCustomerInvoiceCommand({
    ...invoicePayload,
    organization_id: context.organizationId,
    entity_id: context.entityId,
    period_id: context.periodId,
    party_id: partyId,
  });

  const invoiceId = createdInvoiceId(result);
  const artifact = invoiceArtifactUrls({
    invoiceId,
    organizationId: context.organizationId,
    entityId: context.entityId,
  });

  return {
    ...result,
    ...(artifact ? { invoice_document: artifact } : {}),
  };
}
