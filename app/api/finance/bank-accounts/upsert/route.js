export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";
import {
  upsertBankAccountCommand,
} from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      body.organizationId ||
      body.organization_id;
    const requestedEntityId =
      body.entityId ||
      body.entity_id;

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
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

    const result = await upsertBankAccountCommand({
      ...body,
      organization_id: access.organizationId,
      organizationId: access.organizationId,
      entity_id: entity.id,
      entityId: entity.id,
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
