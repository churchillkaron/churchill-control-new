import { createHash } from "node:crypto";

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createCustomerInvoiceCommand,
  issueCustomerCreditNoteCommand,
} from "../runtime/AccountsReceivableApplicationService";
import { mapCustomerInvoiceFormPayload } from "../mappers/customerInvoiceMapper";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function actorId(context = {}) {
  return text(
    context.actor?.id ||
      context.actor?.user_id ||
      context.metadata?.actorId,
    120,
  ) || null;
}
function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function nearlyEqual(a, b) {
  return Math.abs(number(a) - number(b)) <= 0.005;
}
function stableKey(prefix, value) {
  const digest = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 32);
  return `${prefix}:${digest}`;
}

async function loadInvoice({ organizationId, entityId, invoiceId }) {
  const { data, error } = await supabaseAdmin
    .from("customer_invoices")
    .select(
      "id,organization_id,entity_id,party_id,invoice_number,invoice_date,due_date,currency_code,exchange_rate,total_amount,outstanding_balance,outstanding_amount,status,document_type,journal_entry_id,credited_at,cancelled_at,sent_at",
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Source customer invoice not found in the current business scope");
  }
  return data;
}

async function loadInvoiceLines({ organizationId, invoiceId }) {
  const { data, error } = await supabaseAdmin
    .from("customer_invoice_lines")
    .select(
      "description,quantity,unit_price,line_total,item_id,tax_code_id,tax_rule_id,department_id,cost_center_id,project_id,revenue_account_id",
    )
    .eq("organization_id", organizationId)
    .eq("customer_invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

function assertAutomaticallyCorrectable(source) {
  if (text(source.document_type).toUpperCase() !== "INVOICE") {
    throw new Error("Only customer invoices can be corrected by this capability");
  }
  if (!source.journal_entry_id) {
    throw new Error("Source invoice is not posted; use the normal draft/edit workflow instead");
  }
  if (source.cancelled_at) {
    throw new Error("Source invoice is cancelled and cannot be corrected automatically");
  }
  if (source.credited_at) {
    throw new Error("Source invoice has already been credited");
  }

  const total = number(source.total_amount);
  const outstanding = number(
    source.outstanding_balance ?? source.outstanding_amount,
  );
  if (total <= 0 || !nearlyEqual(total, outstanding)) {
    throw new Error(
      "Source invoice has payment or settlement activity; automatic replace-by-credit is blocked",
    );
  }
}

function invoiceArtifact({ invoiceId, organizationId, entityId }) {
  if (!invoiceId || !organizationId) return null;
  const query = new URLSearchParams({ organizationId });
  if (entityId) query.set("entityId", entityId);
  const preview = `/api/finance/customer-invoices/${encodeURIComponent(
    invoiceId,
  )}/pdf?${query.toString()}`;

  return {
    title: "Corrected customer invoice PDF",
    mime_type: "application/pdf",
    preview_url: preview,
    pdf_url: preview,
    download_url: `${preview}&download=1`,
  };
}

export const manifest = defineCapability({
  domain: "finance",
  capability: "accounts_receivable",
  action: "CorrectCustomerInvoice",
  name: "Correct customer invoice",
  document: "CustomerInvoice",
  description:
    "Correct a posted unpaid customer invoice by fully crediting the source document and creating a governed replacement invoice.",
  permissions: ["finance.receivables.manage"],
  events: ["finance.customer_invoice.corrected"],
  tags: [
    "finance",
    "accounts-receivable",
    "customer",
    "invoice",
    "correction",
    "write",
  ],
  operatorAliases: [
    "correct customer invoice",
    "correct invoice",
    "change invoice",
    "fix invoice",
    "replace invoice",
    "revise invoice",
  ],
  operatorExamples: [
    "Correct the invoice I just created.",
    "Change the dates on that invoice.",
    "Fix the last customer invoice and replace it safely.",
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
  operatorPreparationReads: [
    {
      capability_key: "finance.customer_invoices.read",
      payload: { include_lines: true, limit: 100 },
      purpose:
        "Resolve the exact source invoice and its current line details before correction.",
    },
  ],
  operatorVerification: {
    capability_key: "finance.customer_invoices.read",
    payload_from_result: {
      id: [
        "replacement.invoice.id",
        "replacement.invoice_id",
        "replacement.id",
      ],
    },
    derivation: "declared_result_bound_corrected_invoice_verifier",
  },
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
  outputSchema: { type: "object", additionalProperties: true },
});

export function authorize({ context }) {
  return requireExecutionPermission(context, "finance.receivables.manage");
}

export async function execute({ context, payload = {} }) {
  const organizationId = text(context.organizationId, 120);
  const entityId = text(context.entityId, 120);
  const sourceInvoiceId = text(payload.source_invoice_id, 120);

  if (!organizationId || !entityId || !sourceInvoiceId) {
    throw new Error(
      "organization, entity and source_invoice_id are required",
    );
  }

  const source = await loadInvoice({
    organizationId,
    entityId,
    invoiceId: sourceInvoiceId,
  });
  assertAutomaticallyCorrectable(source);

  const sourceLines = await loadInvoiceLines({
    organizationId,
    invoiceId: sourceInvoiceId,
  });

  const replacementInput = object(payload.replacement);
  const replacementLines = list(replacementInput.lines);
  if (!replacementLines.length) {
    throw new Error("Replacement invoice lines are required");
  }

  const correctionDate = text(
    payload.correction_date ||
      replacementInput.invoice_date ||
      new Date().toISOString().slice(0, 10),
    20,
  );
  const reason =
    text(payload.reason, 1000) ||
    `Correction of ${source.invoice_number || source.id}`;

  const keyMaterial = {
    organization_id: organizationId,
    entity_id: entityId,
    source_invoice_id: sourceInvoiceId,
    replacement: replacementInput,
  };
  const baseKey = stableKey("customer-invoice-correction", keyMaterial);

  const credit = await issueCustomerCreditNoteCommand({
    organization_id: organizationId,
    entity_id: entityId,
    party_id: source.party_id,
    source_invoice_id: sourceInvoiceId,
    credit_date: correctionDate,
    amount: source.total_amount,
    reason,
    created_by: actorId(context),
    idempotency_key: `${baseKey}:credit`,
    prefix: "CN",
  });

  const invoicePayload = mapCustomerInvoiceFormPayload({
    payload: {
      ...replacementInput,
      currency_code: source.currency_code,
      exchange_rate: source.exchange_rate || 1,
      idempotency_key: `${baseKey}:replacement`,
      source_document_type: "CUSTOMER_INVOICE_CORRECTION",
      source_document_id: sourceInvoiceId,
      lines: replacementLines,
    },
    partyId: source.party_id,
  });

  const replacement = await createCustomerInvoiceCommand({
    ...invoicePayload,
    organization_id: organizationId,
    entity_id: entityId,
    period_id: context.periodId || null,
    party_id: source.party_id,
  });

  const replacementId = text(
    replacement?.invoice?.id ||
      replacement?.invoice_id ||
      replacement?.id,
    120,
  );
  if (!replacementId) {
    throw new Error("Replacement invoice was not returned by Finance");
  }

  const [verifiedSource, verifiedReplacement] = await Promise.all([
    loadInvoice({
      organizationId,
      entityId,
      invoiceId: sourceInvoiceId,
    }),
    loadInvoice({
      organizationId,
      entityId,
      invoiceId: replacementId,
    }),
  ]);

  if (
    !verifiedSource.credited_at ||
    number(
      verifiedSource.outstanding_balance ??
        verifiedSource.outstanding_amount,
    ) > 0.005
  ) {
    throw new Error(
      "Source invoice correction could not be independently verified",
    );
  }

  if (
    text(verifiedReplacement.invoice_date) !==
      text(replacementInput.invoice_date) ||
    text(verifiedReplacement.due_date) !==
      text(replacementInput.due_date)
  ) {
    throw new Error(
      "Replacement invoice dates could not be independently verified",
    );
  }

  return {
    success: true,
    source_invoice: verifiedSource,
    source_lines: sourceLines,
    credit_note: credit,
    replacement,
    correction_verification: {
      source_invoice_credited: true,
      source_outstanding_zero: true,
      replacement_invoice_verified: true,
    },
    invoice_document: invoiceArtifact({
      invoiceId: replacementId,
      organizationId,
      entityId,
    }),
  };
}
