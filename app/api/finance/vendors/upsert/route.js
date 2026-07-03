export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import createVendor from "@/lib/procurement/suppliers/documents/createVendor";

export async function POST(req) {

  try {

    const body = await req.json();

    const result =
      await createVendor({

        organization_id:
          body.organizationId,

        vendor_code:
          body.vendor_code,

        legal_name:
          body.legal_name || body.display_name,

        display_name:
          body.display_name || body.legal_name,

        tax_id:
          body.tax_id,

        email:
          body.email,

        phone:
          body.phone,

        address:
          body.address,

        payment_terms:
          body.payment_terms,

        notes:
          body.notes,

      });

    if (!result.success) {

      return NextResponse.json(
        result,
        { status: 400 }
      );

    }

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json({

      success: false,
      error: error.message,

    },{

      status: 500,

    });

  }

}
