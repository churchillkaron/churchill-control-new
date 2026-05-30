import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import {
  processMarketingAsset,
} from "@/lib/intake/workflows/processMarketingAsset";

import {
  processExpenseReceipt,
} from "@/lib/intake/workflows/processExpenseReceipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {

  try {

    const supabase =
      createServerSupabase();

    const {
      submissionId,
    } = await req.json();

    const {
      data: submission,
      error,
    } = await supabase
      .from(
        "ai_intake_submissions"
      )
      .select("*")
      .eq(
        "id",
        submissionId
      )
      .single();

    if (error)
      throw error;

    if (
      submission.status !==
      "approved"
    ) {

      return NextResponse.json({
        success: false,
        error:
          "Submission not approved",
      });

    }

    if (
      submission.workflow_created
    ) {

      return NextResponse.json({
        success: true,
        message:
          "Already processed",
      });

    }

    switch (
      submission.ai_type
    ) {

      case
        "MARKETING_ASSET":

        await processMarketingAsset(
          submission
        );

        break;

      case
        "EXPENSE_RECEIPT":

        await processExpenseReceipt(
          submission
        );

        break;

      case
        "INVOICE":

        await processExpenseReceipt(
          submission
        );

        break;

      default:

        return NextResponse.json({
          success: false,
          error:
            `No processor for ${submission.ai_type}`,
        });

    }

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    console.error(
      "INTAKE PROCESS ERROR",
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
