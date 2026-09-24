export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
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

      poster,

      selectedAssets,

      selectedBusiness,

    } = body;

    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: ["creative.generation", "creative.image.generate", "creative.*"],
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }

    const job =
      await CreativeGenerationRuntime.create({

        organization_id:
          access.organizationId,

        entity_id:
          entityId || null,

        campaign_id:
          campaignId || null,

        mission_id:
          missionId || null,

        capability:
          capability ||
          "creative.image.generate",

        input:{

          poster,

          selectedAssets,

          selectedBusiness,

          ...input,

        },

        metadata,

      });



    return NextResponse.json({

      success:true,

      job,

      migrated:true,

    });


  } catch(error) {


    console.error(
      "MARKETING GENERATE COMPATIBILITY ERROR:",
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
