export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${field} required`);
  }
  return value;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.configuration.manage",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const name = String(required(body.name, "Template Name")).trim();
    const documentType = String(required(body.document_type, "Document Type")).trim();
    const rendererDocumentType = DOCUMENT_TYPE_MAP[documentType];

    if (!rendererDocumentType) {
      throw new Error("Document Type is not supported");
    }

    const locale = String(body.locale || "en-GB");
    const scope = String(body.scope || "ORGANIZATION");
    const entityId = scope === "ENTITY" ? required(body.entity_id, "Legal Entity") : null;
    const templateKey = randomUUID();
    const sourceUrl = `builtin://finance/document-template/${templateKey}`;
    const blocks = Array.isArray(body.blocks) && body.blocks.length
      ? body.blocks
      : ["header", "invoice_info", "customer", "lines", "totals", "payment", "footer"];

    const { data: latestVersion, error: versionError } = await supabaseAdmin
      .from("finance_document_templates")
      .select("version")
      .eq("organization_id", access.organizationId)
      .eq("name", name)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError) throw versionError;

    const version = Number(latestVersion?.version || 0) + 1;

    const designMetadata = {
      source: "FINANCE_DOCUMENT_TEMPLATE_BUILDER",
      document_types: [rendererDocumentType],
      finance_document_type: documentType,
      locale,
      version,
      scope,
      entity_id: entityId,
      base_design: body.base_design || "MODERN",
      page: {
        size: body.page_size || "A4",
        orientation: body.orientation || "PORTRAIT",
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
        base_design: body.base_design || "MODERN",
      },
    };

    const { data: designAsset, error: assetError } = await supabaseAdmin
      .from("creative_assets")
      .insert({
        organization_id: access.organizationId,
        asset_type: "DOCUMENT_DESIGN",
        file_url: sourceUrl,
        image_url: sourceUrl,
        thumbnail_url: sourceUrl,
        file_name: `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-v${version}`,
        name,
        title: name,
        description: `${documentType} document design`,
        metadata: designMetadata,
        analysis: {},
        tags: ["finance", "document-template", documentType.toLowerCase()],
        ai_generated: false,
        archived: false,
        created_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (assetError) throw assetError;

    const { data: template, error: templateError } = await supabaseAdmin
      .from("finance_document_templates")
      .insert({
        organization_id: access.organizationId,
        name,
        document_type: documentType,
        locale,
        version,
        template_source_url: sourceUrl,
        status: "DRAFT",
        created_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (templateError) {
      await supabaseAdmin.from("creative_assets").delete().eq("id", designAsset.id);
      throw templateError;
    }

    return NextResponse.json({
      success: true,
      message: "Draft document template created",
      template: {
        ...template,
        design_asset_id: designAsset.id,
        renderer_document_type: rendererDocumentType,
      },
    });
  } catch (error) {
    const message = error?.message || "Unable to create document template";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|not supported/i.test(message) ? 400 : 500 }
    );
  }
}
