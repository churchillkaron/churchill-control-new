import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      image,
      notes,
      organizationId,
      uploadedBy,
      documentId,
    } = body;

    if (!image) {
      return NextResponse.json(
        {
          success: false,
          error: "Image required",
        },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status }
      );
    }

    const resolvedOrganizationId = access.organizationId;

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: resolvedOrganizationId,
      service_id: "document.classify",
      provider_id: "openai",
      input: {
        prompt: `
You are Churchill AI Intake.

Classify the uploaded image by BUSINESS PURPOSE and WORKFLOW DESTINATION.

Return JSON ONLY:

{
  "module": "",
  "type": "",
  "confidence": 0,
  "reason": ""
}

Only classify invoices when an actual invoice, receipt, supplier invoice, or tax invoice is visible.
`,
        image,
      },
      metadata: {
        module: "INTAKE",
        operation: "CLASSIFY_UPLOAD",
        uploadedBy,
        documentId,
      },
      category: "DOCUMENT",
    });

    const text = execution?.output?.text || "";
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("No JSON returned");
    }

    const result = JSON.parse(match[0]);
    const destinationModule = result.module || "REVIEW";
    let destinationRecordId = null;

    if (
      result.type === "SUPPLIER_INVOICE" ||
      result.type === "INVOICE"
    ) {
      try {
        const ocrExecution = await ServiceExecutionRuntime.execute({
          organization_id: resolvedOrganizationId,
          service_id: "document.ocr",
          provider_id: "openai",
          input: {
            image,
            model: "gpt-4.1-mini",
          },
          metadata: {
            module: "FINANCE",
            operation: "INVOICE_OCR",
            documentId,
          },
          category: "DOCUMENT",
        });

        const ocrText = ocrExecution?.output?.text || "";

        if (ocrText) {
          const { processInvoice } = await import(
            "@/lib/finance/invoice/processInvoice"
          );

          const invoiceResult = await processInvoice({
            ocrText,
            organizationId: resolvedOrganizationId,
          });

          if (invoiceResult?.success) {
            destinationRecordId = invoiceResult.data?.id || null;
          }
        }
      } catch (error) {
        console.error("OCR_AUTO_ROUTE_ERROR", error);
      }
    }

    if (documentId) {
      const financialImpactTypes = [
        "INVOICE",
        "SUPPLIER_INVOICE",
        "EXPENSE_RECEIPT",
        "CASH_PURCHASE",
        "PURCHASE_ORDER",
      ];

      const { error: documentUpdateError } = await supabaseAdmin
        .from("organization_documents")
        .update({
          ai_module: result.module,
          ai_type: result.type,
          approval_required: financialImpactTypes.includes(result.type),
          financial_impact: financialImpactTypes.includes(result.type),
          destination_module: destinationModule,
          destination_record_id: destinationRecordId,
          status: "classified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId)
        .eq("organization_id", resolvedOrganizationId);

      if (documentUpdateError) {
        throw documentUpdateError;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("ai_intake_submissions")
      .insert({
        organization_id: resolvedOrganizationId,
        uploaded_by: uploadedBy || access.staff?.id || null,
        image_url: image,
        notes: notes || "",
        ai_module: result.module,
        ai_type: result.type,
        ai_confidence: result.confidence,
        destination_module: destinationModule,
        destination_record_id: destinationRecordId,
        organization_document_id: documentId || null,
        status: "classified",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: resolvedOrganizationId,
      classification: result,
      submission: data,
    });
  } catch (error) {
    console.error("INTAKE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to classify intake",
      },
      { status: 500 }
    );
  }
}
