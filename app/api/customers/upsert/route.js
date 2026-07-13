export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  createCustomer,
} from "@/lib/finance/createCustomer";

import {
  CustomerIdentityRuntime,
} from "@/lib/platform/service-runtime/identity/runtime/CustomerIdentityRuntime";


export async function POST(req) {

  try {

    const body =
      await req.json();


    const organization_id =
      body.organization_id ||
      body.organizationId;


    if (!organization_id) {

      return NextResponse.json(
        {
          success:false,
          error:"organization_id required",
        },
        {
          status:400,
        }
      );

    }


    const customer =
      await createCustomer({

        organization_id,

        entity_id:
          body.entity_id ||
          null,

        customer_name:
          body.customer_name,

        customer_phone:
          body.customer_phone ||
          null,

        customer_email:
          body.customer_email ||
          null,

        customer_type:
          body.customer_type ||
          "PERSON",

        company_name:
          body.company_name ||
          null,

        tax_number:
          body.tax_number ||
          null,

        billing_address:
          body.billing_address ||
          null,

        shipping_address:
          body.shipping_address ||
          null,

        city:
          body.city ||
          null,

        state:
          body.state ||
          null,

        postal_code:
          body.postal_code ||
          null,

        country:
          body.country ||
          null,

        preferred_language:
          body.preferred_language ||
          null,

        preferred_currency:
          body.preferred_currency ||
          null,

        credit_limit:
          body.credit_limit ||
          null,

        payment_terms:
          body.payment_terms ||
          null,

        birthday:
          body.birthday ||
          null,

        notes:
          body.notes ||
          null,

      });


    if (
      body.provider_id &&
      body.external_id &&
      customer?.id
    ) {

      await CustomerIdentityRuntime.link({

        organization_id,

        customer_id:
          customer.id,

        provider_id:
          body.provider_id,

        external_id:
          body.external_id,

        identity_type:
          body.identity_type ||
          "CUSTOMER",

      }).catch(() => null);

    }


    return NextResponse.json({

      success:true,

      customer,

    });


  } catch(error) {


    return NextResponse.json(

      {
        success:false,
        error:error.message,
      },

      {
        status:500,
      }

    );

  }

}
