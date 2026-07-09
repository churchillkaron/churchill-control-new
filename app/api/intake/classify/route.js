import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const supabase = createServerSupabase();

    const body = await req.json();

    const {
      image,
      notes,
      tenantId,
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
        {
          status: 400,
        }
      );
    }


    const execution =
      await ServiceExecutionRuntime.execute({

        organization_id:
          organizationId,

        service_id:
          "document.classify",

        provider_id:
          "openai",

        input:{

          prompt:
`
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

        metadata:{

          module:
            "INTAKE",

          operation:
            "CLASSIFY_UPLOAD",

          uploadedBy,

          documentId,

        },

        category:
          "DOCUMENT",

      });


    const text =
      execution?.output?.text ||
      "";

    const match =
      text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error(
        "No JSON returned"
      );
    }

    const result =
      JSON.parse(match[0]);

    let destinationModule =
      result.module ||
      "REVIEW";

    let destinationRecordId = null;

    if (
      result.type === "SUPPLIER_INVOICE" ||
      result.type === "INVOICE"
    ) {

      try {

        const ocrExecution =
          await ServiceExecutionRuntime.execute({

            organization_id:
              organizationId,

            service_id:
              "document.ocr",

            provider_id:
              "openai",

            input:{

              image,

              model:
                "gpt-4.1-mini",

            },

            metadata:{

              module:
                "FINANCE",

              operation:
                "INVOICE_OCR",

              documentId,

            },

            category:
              "DOCUMENT",

          });


        const ocrText =
          ocrExecution?.output?.text ||
          "";


        if (ocrText) {

          const {
            processInvoice,
          } =
            await import(
              "@/lib/finance/invoice/processInvoice"
            );


          const invoiceResult =
            await processInvoice({

              ocrText,

              organizationId,

            });


          if (
            invoiceResult?.success
          ) {

            destinationRecordId =
              invoiceResult.data?.id ||
              null;

          }

        }

      } catch (error) {

        console.error(
          "OCR AUTO ROUTE ERROR",
          error
        );

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

      const {
        error: documentUpdateError,
      } = await supabaseAdmin
        .from("organization_documents")
        .update({

          ai_module:
            result.module,

          ai_type:
            result.type,

          approval_required:
            financialImpactTypes.includes(
              result.type
            ),

          financial_impact:
            financialImpactTypes.includes(
              result.type
            ),

          destination_module:
            destinationModule,

          destination_record_id:
            destinationRecordId,

          status:
            "classified",

          updated_at:
            new Date().toISOString(),

        })
        .eq(
          "id",
          documentId
        );

      if (documentUpdateError) {

        console.error(
          "DOCUMENT_UPDATE_ERROR",
          documentUpdateError
        );

      }

    }


    const {
      data,
      error,
    } = await supabase
      .from(
        "ai_intake_submissions"
      )
      .insert([
        {
          tenant_id:
            tenantId,

          uploaded_by:
            uploadedBy,

          image_url:
            image,

          notes:
            notes || "",

          ai_module:
            result.module,

          ai_type:
            result.type,

          ai_confidence:
            result.confidence,

          destination_module:
            destinationModule,

          organization_document_id:
            documentId || null,

          status:
            "classified",
        },
      ])
      .select()
      .single();

    if (error) {

      console.error(
        "INTAKE_INSERT_ERROR",
        JSON.stringify(
          error,
          null,
          2
        )
      );

      throw error;

    }

    return NextResponse.json({
      success: true,
      classification:
        result,
      submission:
        data,
    });

  } catch (error) {

    console.error(
      "INTAKE ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }
}
