import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";
import { logAIUsage } from "@/lib/ai/logAIUsage";

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
      uploadedBy,
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

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response =
      await openai.responses.create({
        model: "gpt-4.1",
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `
You are Churchill AI Intake.

Classify the uploaded image by BUSINESS PURPOSE and WORKFLOW DESTINATION.

Do not classify only by what objects are visible.
Ask: Which Churchill module should receive this image?

Important examples:

- A visible receipt, tax invoice, supplier invoice, purchase receipt
  -> ACCOUNTING / INVOICE or EXPENSE_RECEIPT

- A supplier delivery, goods arrival, stock receiving photo
  -> PROCUREMENT / DELIVERY

- A branded business image, dashboard presentation, executive meeting, luxury business scene, marketing-quality render, venue atmosphere, food/drink photo, event photo
  -> MARKETING / MARKETING_ASSET or SOCIAL_MEDIA_CONTENT

- A dish, recipe sheet, ingredients, food preparation
  -> PRODUCTION / RECIPE or FOOD_PREP

- A broken item, leak, damaged furniture, damaged equipment
  -> MAINTENANCE / DAMAGE

- Cleaning proof, opening proof, closing proof, checklist photo
  -> OPERATIONS / ROUTINE_CHECK

- Safety issue, fight, theft, security problem
  -> SECURITY / INCIDENT

Return JSON ONLY:

{
  "module": "",
  "type": "",
  "confidence": 0,
  "reason": ""
}

Valid modules and types:

ACCOUNTING:
INVOICE
EXPENSE_RECEIPT
CASH_PURCHASE
FINANCIAL_DOCUMENT

PROCUREMENT:
DELIVERY
PURCHASE_ORDER
SUPPLIER_DOCUMENT

MARKETING:
MARKETING_ASSET
EVENT_PHOTO
SOCIAL_MEDIA_CONTENT
MENU_PHOTO

PRODUCTION:
RECIPE
INGREDIENT
FOOD_PREP

OPERATIONS:
ROUTINE_CHECK
QUALITY_CHECK
OPENING_CHECK
CLOSING_CHECK

MAINTENANCE:
DAMAGE
REPAIR

SECURITY:
INCIDENT

REVIEW:
UNKNOWN

Only classify as INVOICE when an actual invoice, receipt, supplier invoice, or tax invoice is visible.

Do not classify office workers, accountants, paperwork, filing cabinets, spreadsheets, desks, or office environments as invoices.
`,
              },
              {
                type: "input_image",
                image_url: image,
              },
            ],
          },
        ],
      });

    await logAIUsage({

      tenantId,

      userId:
        uploadedBy,

      module:
        "INTAKE",

      operation:
        "CLASSIFY_UPLOAD",

      provider:
        "openai",

      model:
        "gpt-4.1",

      promptTokens:
        response?.usage?.input_tokens || 0,

      completionTokens:
        response?.usage?.output_tokens || 0,

    });

    const text =
      response.output_text ||
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

        const baseUrl =
          process.env.NEXT_PUBLIC_SITE_URL ||
          "http://localhost:3000";

        const ocrResponse =
          await fetch(
            `${baseUrl}/api/invoices/ocr`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                image,
              }),

            }
          );

        const ocr =
          await ocrResponse.json();

        console.log(
          "OCR RESULT",
          ocr
        );

        if (
          ocr?.success &&
          ocr?.invoice?.id
        ) {

          destinationRecordId =
            ocr.invoice.id;

        }

      } catch (error) {

        console.error(
          "OCR AUTO ROUTE ERROR",
          error
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
