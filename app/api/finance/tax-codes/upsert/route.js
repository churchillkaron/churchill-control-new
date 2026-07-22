export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  upsertTaxCodeCommand,
} from "@/lib/finance/tax-codes/runtime/TaxCodeApplicationService";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organization_id ||
        body.organizationId,
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

    const result = await upsertTaxCodeCommand({
      organization_id: access.organizationId,
      values: {
        ...body,
        organization_id: access.organizationId,
      },
    });

    return NextResponse.json({
      success: true,
      taxCode: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Tax code upsert failed",
      },
      {
        status: 500,
      }
    );
  }
}
