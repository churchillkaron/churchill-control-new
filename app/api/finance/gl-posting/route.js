import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import postVendorPaymentGL from "@/lib/finance/gl-posting/postVendorPaymentGL";

export async function POST(req) {

  try {

    const body =
      await req.json()

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const organization_id =
      access.organizationId;

    const result =
      await postVendorPaymentGL({

        organization_id:
          organization_id,

        payment_id:
          body.payment_id,

        amount:
          body.amount,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

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
