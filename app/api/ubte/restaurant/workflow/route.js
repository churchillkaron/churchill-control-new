import { NextResponse } from "next/server";

import {
  executeRestaurantWorkflow,
} from "@/lib/restaurant/runtime/workflows/RestaurantWorkflowEngine";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body =
      await req.json();

    if (!body.workflow) {
      return NextResponse.json(
        {
          success: false,
          error: "workflow required",
        },
        {
          status: 400,
        }
      );
    }

    if (!body.context?.organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "context.organizationId required",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await executeRestaurantWorkflow({
        workflow:
          body.workflow,

        context:
          body.context,

        payload:
          body.payload || {},
      });

    return NextResponse.json({
      success: true,
      workflow:
        body.workflow,
      result,
    });

  } catch (error) {
    console.error(
      "[RESTAURANT_WORKFLOW]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
