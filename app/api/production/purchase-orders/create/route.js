import { NextResponse } from 'next/server'
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { createPurchaseOrder } from '@/lib/inventory/production/purchasing/documents/createPurchaseOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()


    const access = await requireOrganizationAccess({

      organizationId: body.organization_id || body.organizationId,

      request: req,

    });


    if (!access.success) {

      return NextResponse.json(

        { success: false, error: access.error },

        { status: access.status || 403 },

      );

    }

    const result =
      await createPurchaseOrder({
        ...body,
        organization_id: access.organizationId,
        entity_id:
          body.entity_id ||
          body.entityId ||
          null,
      })

    return NextResponse.json({
      success: true,
      result,
    })

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
    )
  }
}
