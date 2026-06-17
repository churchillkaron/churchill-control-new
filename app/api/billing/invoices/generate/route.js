import { NextResponse } from "next/server";

import {
  generateOrganizationInvoice,
} from "@/lib/billing/generateOrganizationInvoice";

export async function POST(req) {
  try {

    const {
      organizationId,
      billingCycle,
    } = await req.json();

    const result =
      await generateOrganizationInvoice({

        organizationId,

        billingCycle:
          billingCycle || "monthly",

      });

    return NextResponse.json(
      result,
      {
        status:
          result.success
            ? 200
            : 400,
      }
    );

  } catch (error) {

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
