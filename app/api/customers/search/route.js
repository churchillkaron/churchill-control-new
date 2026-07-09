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
        .map(row => row.parties)
        .filter(Boolean);


    return NextResponse.json({

      success:true,

      customers

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
