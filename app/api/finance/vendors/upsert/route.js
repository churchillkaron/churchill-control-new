export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";


import createVendor
from "@/lib/procurement/suppliers/documents/createVendor";



export async function POST(req) {

  try {


    const body =
      await req.json();



    const vendor =
      await createVendor({

        organization_id:
          body.organizationId,


        vendor_code:
          body.vendor_code || null,


        legal_name:
          body.legal_name ||
          body.display_name,


        display_name:
          body.display_name ||
          body.legal_name,


        tax_id:
          body.tax_id || null,


        email:
          body.email || null,


        phone:
          body.phone || null,


        address:
          body.address || null,


        payment_terms:
          body.payment_terms || null,


        default_expense_account:
          body.default_expense_account || null,


        default_ap_account:
          body.default_ap_account || null,


        risk_level:
          body.risk_level || "LOW",


        notes:
          body.notes || null,


      });



    return NextResponse.json({

      success:true,

      vendor,

    });



  } catch(error) {


    return NextResponse.json({

      success:false,

      error:
        error.message,

    },{
      status:500,
    });


  }

}
