export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";

import createCostCenter from "@/lib/finance/cost-centers/createCostCenter";

export async function POST(req) {
  try {
    await requireAuth();

    const body = await req.json();
    const requestedOrganizationId =
      body.organizationId ||
      body.organization_id;
    const requestedEntityId =
      body.entityId ||
      body.entity_id;

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
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

    if (!requestedEntityId) {
      return NextResponse.json(
        {
          success: false,
          error: "entity_id required",
        },
        {
          status: 400,
        }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        {
          success: false,
          error: "Legal entity not found in organisation",
        },
        {
          status: 404,
        }
      );
    }

    const result = await createCostCenter({
      organization_id: access.organizationId,
      entity_id: entity.id,
      code: body.code,
      name: body.name,
      type: body.type || null,
      manager: body.manager || null,
    });

    return NextResponse.json(
      result,
      {
        status: result?.success === false ? 400 : 200,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
