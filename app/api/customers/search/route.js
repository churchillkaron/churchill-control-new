export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {

  try {

    const body =
      await req.json();


    console.log(
      "CUSTOMER SEARCH BODY",
      body
    );

    const organizationId =
      body.organizationId ||
      body.organization_id;


    const access =
      await requireOrganizationAccess({
        organizationId,
      });


    if (!access.success) {

      return NextResponse.json(
        {
          success:false,
          error:access.error,
        },
        {
          status:access.status,
        }
      );

    }


    const query =
      String(body.query || "").trim();


    let db =
      supabaseAdmin
        .from("party_relationships")
        .select(`
          party_id,
          parties(
            id,
            display_name,
            party_type,
            email,
            phone
          )
        `)
        .eq(
          "organization_id",
          organizationId
        )
        .eq(
          "relationship_type",
          "customer"
        );


    if (query) {

      db =
        db.ilike(
          "parties.display_name",
          `%${query}%`
        );

    }


    const {
      data,
      error,
    } =
      await db
        .limit(20);


    if (error) {
      throw error;
    }


    const customers =
      (data || [])
        .map(row => ({
          ...row.parties,
          party_id:
            row.party_id,
        }))
        .filter(Boolean);


    const enrichedCustomers =
      await Promise.all(

        customers.map(async(customer)=>{

          const {
            data: customerAccount,
          } =
            await supabaseAdmin
              .from("customer_loyalty_accounts")
              .select(`
                id,
                party_id,
                customer_number,
                customer_name,
                customer_phone,
                customer_email,
                customer_type,
                company_name,
                tax_number,
                billing_address,
                shipping_address,
                city,
                state,
                postal_code,
                country,
                preferred_language,
                preferred_currency,
                credit_limit,
                payment_terms,
                birthday,
                notes
              `)
              .eq(
                "party_id",
                customer.party_id
              )
              .eq(
                "organization_id",
                organizationId
              )
              .maybeSingle();


          return {

            ...customer,

            customer_id:
              customerAccount?.id || null,

            customer_number:
              customerAccount?.customer_number || null,

            customer_name:
              customerAccount?.customer_name ||
              customer.display_name ||
              "",

            customer_phone:
              customerAccount?.customer_phone ||
              customer.phone ||
              "",

            customer_email:
              customerAccount?.customer_email ||
              customer.email ||
              "",

            customer_type:
              customerAccount?.customer_type ||
              (
                customer.party_type === "organization"
                  ? "COMPANY"
                  : "PERSON"
              ),

            company_name:
              customerAccount?.company_name || "",

            tax_number:
              customerAccount?.tax_number || "",

            billing_address:
              customerAccount?.billing_address || "",

            shipping_address:
              customerAccount?.shipping_address || "",

            city:
              customerAccount?.city || "",

            state:
              customerAccount?.state || "",

            postal_code:
              customerAccount?.postal_code || "",

            country:
              customerAccount?.country || "",

            preferred_language:
              customerAccount?.preferred_language || "",

            preferred_currency:
              customerAccount?.preferred_currency || "",

            credit_limit:
              customerAccount?.credit_limit || 0,

            payment_terms:
              customerAccount?.payment_terms || "",

            birthday:
              customerAccount?.birthday || "",

            notes:
              customerAccount?.notes || "",

          };

        })

      );


    return NextResponse.json({

      success:true,

      customers:
        enrichedCustomers

    });


  } catch(error) {

    console.error(
      "CUSTOMER SEARCH ERROR",
      error
    );

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
