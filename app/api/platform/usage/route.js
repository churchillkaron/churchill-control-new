import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";


export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);


    const organizationId =
      searchParams.get(
        "organization_id"
      );


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


    const { data, error } =
      await supabaseAdmin
        .from("platform_service_usage")
        .select("*")
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


    if(error) throw error;


    return NextResponse.json({

      success:true,

      usage:
        data || [],

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
