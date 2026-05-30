import { NextResponse } from "next/server";

import {
  createAccountingClient,
} from "@/lib/accounting/createAccountingClient";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await createAccountingClient({
        ...body,
      });

    return NextResponse.json({
      success: true,
      organization: result.organization,
      relationship: result.relationship,
      profile: result.profile,
      engagement: result.engagement,
    });
  } catch (error) {
    console.error(error);

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
