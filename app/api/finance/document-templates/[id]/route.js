export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const DOCUMENT_TYPE_MAP = Object.freeze({
  CUSTOMER_INVOICE: "CustomerInvoice",
  CUSTOMER_STATEMENT: "CustomerStatement",
  VENDOR_STATEMENT: "VendorStatement",
  PAYMENT_RECEIPT: "PaymentReceipt",
  CREDIT_NOTE: "CreditNote",
  DEBIT_NOTE: "DebitNote",
  PURCHASE_ORDER: "PurchaseOrder",
  REMITTANCE_ADVICE: "RemittanceAdvice",
  FINANCIAL_REPORT: "FinancialReport",
});

async function resolveAccess(request, organizationId) {
  return await requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: "finance.configuration.manage",
  });
}

async function readTemplate(organizationId, id) {
  const { data, error } = await supabaseAdmin
    .from("finance_document_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Document template not found");
  return data;
}

async function readDesign(template) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", template.organization_id)
    .eq("asset_type", "DOCUMENT_DESIGN")
    .eq("file_url", template.template_source_url)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(request, { params }) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await resolveAccess(
      request,
      searchParams.get("organizationId") || searchParams.get("organization_id")
    );

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const template = await readTemplate(access.organizationId, params.id);
    const design = await readDesign(template);

    return NextResponse.json({ success: true, template, design, metadata: design?.metadata || {} });
  } catch (error) {
    const message = error?.message || "Unable to load document template";
    return NextResponse.json({ success: false, error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const access = await resolveAccess(request, body.organizationId || body.organization_id);

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const template = await readTemplate(access.organizationId, params.id);
    if (template.status === "ARCHIVED") throw new Error("Archived templates cannot be edited");

    const design = await readDesign(template);
    const documentType = body.document_type || template.document_type;
    const rendererDocumentType = DOCUMENT_TYPE_MAP[documentType];
    if (!rendererDocumentType) throw new Error("Document Type is not supported");

    const blocks = Array.isArray(body.blocks) && body.blocks.length
      ? body.blocks
      : design?.metadata?.blocks || ["header", "invoice_info", "customer", "lines", "totals", "payment", "footer"];

    const metadata = {
      ...(design?.metadata || {}),
      document_types: [rendererDocumentType],
      finance_document_type: documentType,
      locale: body.locale || template.locale,
      scope: body.scope || design?.metadata?.scope || "ORGANIZATION",
      entity_id: body.scope === "ENTITY" ? body.entity_id : null,
      base_design: body.base_design || design?.metadata?.base_design || "MODERN",
      page: {
        size: body.page_size || design?.metadata?.page?.size || "A4",
        orientation: body.orientation || design?.metadata?.page?.orientation || "PORTRAIT",
      },
      blocks,
      options: {
        show_logo: body.show_logo !== false,
        show_tax_summary: body.show_tax_summary !== false,
        show_payment_details: body.show_payment_details !== false,
      },
      content: {
        payment_note: body.payment_note || "",
        legal_note: body.legal_note || "",
        footer_note: body.footer_note || "",
      },
      layout: {
        blocks,
        base_design: body.base_design || design?.metadata?.base_design || "MODERN",
      },
    };

    if (design) {
      const { error: designError } = await supabaseAdmin
        .from("creative_assets")
        .update({
          name: body.name || template.name,
          title: body.name || template.name,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", design.id)
        .eq("organization_id", access.organizationId);
      if (designError) throw designError;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("finance_document_templates")
      .update({
        name: body.name || template.name,
        document_type: documentType,
        locale: body.locale || template.locale,
        status: "DRAFT",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", access.organizationId)
      .eq("id", template.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: "Template updated as draft", template: updated });
  } catch (error) {
    const message = error?.message || "Unable to update document template";
    return NextResponse.json({ success: false, error: message }, { status: /not found|cannot|not supported/i.test(message) ? 400 : 500 });
  }
}
