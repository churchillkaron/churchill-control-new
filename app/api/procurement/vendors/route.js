import { NextResponse } from "next/server";

import { createVendor } from "@/lib/procurement/suppliers/documents/createVendor";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const result =
      await createVendor(
        {
          ...body,
          organization_id:
            access.organizationId,
        }
      );

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
