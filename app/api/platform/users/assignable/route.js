export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function GET(req) {

  try {

    await requireAuth();


    const {
      searchParams,
    } =
      new URL(req.url);


    const organizationId =
      searchParams.get(
        "organizationId"
      );


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


    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("staff_accounts")
        .select(`
          id,
          name,
          role,
          position,
          department,
          party_id
        `)
        .eq(
          "active_organization_id",
          access.organizationId
        )
        .eq(
          "active",
          true
        );


    if (error) {
      throw error;
    }


    const partyIds =
      (data || [])
        .map(user => user.party_id)
        .filter(Boolean);


    const {
      data: parties,
    } =
      partyIds.length
        ? await supabaseAdmin
            .from("parties")
            .select(
              "id,display_name"
            )
            .in(
              "id",
              partyIds
            )
        : {
            data:[]
          };


    const partyMap =
      Object.fromEntries(
        (parties || [])
          .map(p => [
            p.id,
            p.display_name
          ])
      );


    return NextResponse.json({

      success:true,

      users:
        (data || []).map(user => ({

          staff_id:
            user.id,

          party_id:
            user.party_id,

          name:
            partyMap[user.party_id] ||
            user.name,

          role:
            user.role,

          position:
            user.position,

          department:
            user.department,

        })),

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
