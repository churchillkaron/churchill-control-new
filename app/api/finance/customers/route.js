export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);


    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");


    if (!organizationId) {

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


    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .select(`
          id,
          organization_id,
          entity_id,
          party_id,
          customer_name,
          customer_phone,
          customer_email,
          customer_type,
          company_name,
          tax_number,
          tier,
          status,
          created_at,

          parties (
            id,
            display_name,
            email,
            phone,
            party_type
          )
        `)
        .eq(
          "organization_id",
          organizationId
        )
        .order(
          "created_at",
          {
            ascending:false,
          }
        );


    if (error) {
      throw error;
    }


    const rows =
      (data || []).map(
        (customer)=>({

          ...customer,

          name:
            customer.customer_name ||
            customer.parties?.display_name ||
            "Unnamed Customer",

          email:
            customer.customer_email ||
            customer.parties?.email ||
            null,

          phone:
            customer.customer_phone ||
            customer.parties?.phone ||
            null,

        })
      );


    return NextResponse.json({

      success:true,

      organizationIdReceived:
        organizationId,

      rowCount:
        rows.length,

      rows,

      customers:
        rows,

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
