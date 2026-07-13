export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeGenerationRuntime,
} from "@/lib/creative/generation/runtime/CreativeGenerationRuntime";


export async function POST(request) {

  try {

    const body =
      await request.json();


    const {

      organizationId,

      entityId,

      campaignId,

      missionId,

      capability,

      input = {},

      metadata = {},

    } = body;


    if (!organizationId) {

      throw new Error(
        "organizationId required"
      );

    }


    if (!capability) {

      throw new Error(
        "generation capability required"
      );

    }


    const job =
      await CreativeGenerationRuntime.create({

        organization_id:
          organizationId,

        entity_id:
          entityId || null,

        campaign_id:
          campaignId || null,

        mission_id:
          missionId || null,

        capability,

        input,

        metadata,

      });



    return NextResponse.json({

      success:true,

      job,

    });


  } catch(error) {


    console.error(
      "CREATIVE GENERATION ERROR:",
      error
    );


    return NextResponse.json(

      {

        success:false,

        error:
          error.message,

      },

      {
        status:500,
      }

    );

  }

}
