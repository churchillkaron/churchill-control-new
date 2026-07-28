export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  upsertTaxCodeCommand,
} from "@/lib/finance/tax-codes/runtime/TaxCodeApplicationService";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organization_id ||
        body.organizationId,
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

    const result = await upsertTaxCodeCommand({
      organization_id: access.organizationId,
      values: {
        id: body.id || null,
        code: body.code,
        name: body.name,
        rate: body.rate,
        regime: body.regime,
        standard: body.standard,
        effective_from: body.effective_from,
        effective_to: body.effective_to,
        is_active: body.is_active,
      },
    });

    return NextResponse.json({
      success: true,
      taxCode: result,
    });
  } catch (error) {
    const message = error.message || "Tax code upsert failed";
    const status = /required|between|valid date|cannot be after|overlaps/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      }
    );
  }
}
