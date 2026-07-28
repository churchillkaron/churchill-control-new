import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FINANCE_DOCUMENT_TYPES = Object.freeze({
  CustomerInvoice: "CUSTOMER_INVOICE",
  CustomerStatement: "CUSTOMER_STATEMENT",
  VendorStatement: "VENDOR_STATEMENT",
  PaymentReceipt: "PAYMENT_RECEIPT",
  CreditNote: "CREDIT_NOTE",
  DebitNote: "DEBIT_NOTE",
  PurchaseOrder: "PURCHASE_ORDER",
  RemittanceAdvice: "REMITTANCE_ADVICE",
  FinancialReport: "FINANCIAL_REPORT",
});

function creativeTemplateModel(asset) {
  if (!asset) return null;

  return {
    id: asset.id,
    source: "creative_asset",
    name: asset.name,
    template: asset.metadata || {},
    layout: asset.metadata || {},
    asset,
  };
}

async function resolveActiveFinanceTemplate({ organizationId, documentType }) {
  const financeDocumentType = FINANCE_DOCUMENT_TYPES[documentType];
  if (!financeDocumentType) return null;

  const { data: catalogue, error: catalogueError } = await supabaseAdmin
    .from("finance_document_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("document_type", financeDocumentType)
    .eq("status", "ACTIVE")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (catalogueError || !catalogue) return null;

  const { data: asset, error: assetError } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("asset_type", "DOCUMENT_DESIGN")
    .eq("archived", false)
    .eq("file_url", catalogue.template_source_url)
    .maybeSingle();

  if (assetError || !asset) return null;

  return {
    ...creativeTemplateModel(asset),
    finance_template: catalogue,
  };
}

async function resolveCreativeStudioTemplate({ organizationId, documentType }) {
  const { data: creativeAssets, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("asset_type", "DOCUMENT_DESIGN")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) return null;

  const asset = (creativeAssets || []).find((candidate) => {
    if (candidate.metadata?.source === "FINANCE_DOCUMENT_TEMPLATE_BUILDER") {
      return false;
    }

    return candidate.metadata?.document_types?.includes(documentType);
  });

  return creativeTemplateModel(asset);
}

async function resolveLegacyOrganizationTemplate({ organizationId, documentType }) {
  const { data, error } = await supabaseAdmin
    .from("document_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("document_type", documentType)
    .ilike("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return error ? null : data;
}

async function resolveSystemTemplate(documentType) {
  const { data, error } = await supabaseAdmin
    .from("document_templates")
    .select("*")
    .is("organization_id", null)
    .eq("document_type", documentType)
    .ilike("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return error ? null : data;
}

export async function resolveTemplate({ organizationId, documentType }) {
  if (organizationId) {
    const financeTemplate = await resolveActiveFinanceTemplate({
      organizationId,
      documentType,
    });

    if (financeTemplate) return financeTemplate;

    const creativeTemplate = await resolveCreativeStudioTemplate({
      organizationId,
      documentType,
    });

    if (creativeTemplate) return creativeTemplate;

    const organizationTemplate = await resolveLegacyOrganizationTemplate({
      organizationId,
      documentType,
    });

    if (organizationTemplate) return organizationTemplate;
  }

  return await resolveSystemTemplate(documentType);
}
