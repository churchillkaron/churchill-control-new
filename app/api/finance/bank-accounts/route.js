export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";
import {
  listBankAccountsCommand,
} from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");
    const requestedEntityId =
      searchParams.get("entity_id") ||
      searchParams.get("entityId");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
          bankAccounts: [],
          rows: [],
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
          bankAccounts: [],
          rows: [],
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
          bankAccounts: [],
          rows: [],
        },
        {
          status: 404,
        }
      );
    }

    const rows = await listBankAccountsCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      bankAccounts: rows,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        bankAccounts: [],
        rows: [],
      },
      {
        status: 500,
      }
    );
  }
}
