import { NextResponse } from "next/server";

import { validateDomainEvent } from "@/lib/platform/events/validateDomainEvent";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await validateDomainEvent({
        tenantId:
          body.tenantId,
        domainName:
          body.domainName,
        eventType:
          body.eventType,
        sourceReference:
          body.sourceReference,
      });

    return NextResponse.json({
      success: true,
      result,
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
