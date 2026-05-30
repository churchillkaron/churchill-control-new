import { NextResponse } from "next/server";

import { createRule } from "@/lib/orchestration/createRule";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const rule =
      await createRule({
        tenantId:
          body.tenantId,
        ruleName:
          body.ruleName,
        entityType:
          body.entityType,
        triggerEvent:
          body.triggerEvent,
        conditionDefinition:
          body.conditionDefinition,
        actionDefinition:
          body.actionDefinition,
      });

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
