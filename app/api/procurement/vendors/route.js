import { NextResponse } from "next/server";

import { createVendor } from "@/lib/inventory/procurement/suppliers/documents/createVendor";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

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
        request: req,
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

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "procurement.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result =
      await createVendor(
        {
          ...body,
          organization_id:
            access.organizationId,
          actor_id: access.user?.id || null,
          idempotency_key: body.idempotency_key || req.headers.get("idempotency-key") || null,
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
