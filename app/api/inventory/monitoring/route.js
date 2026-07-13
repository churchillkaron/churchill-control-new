import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import runInventoryMonitoring from "@/lib/inventory/runtime/runInventoryMonitoring";

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId ||
          body.organization_id,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const organizationId =
      access.organizationId;

    const entityId =
      body.entityId ||
      body.entity_id ||
      null;


    if (!organizationId) {

      return NextResponse.json(
        {
          success: false,
          error: "Missing organization context",
        },
        {
          status: 400,
        }
      );

    }

    const result =
      await runInventoryMonitoring({

        organizationId,
        entityId,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
