export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createVendor } from "@/lib/inventory/procurement/suppliers/documents/createVendor";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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

    const vendor = await createVendor({
      organization_id: access.organizationId,
      vendor_code: body.vendor_code || null,
      legal_name:
        body.legal_name ||
        body.display_name,
      display_name:
        body.display_name ||
        body.legal_name,
      tax_id: body.tax_id || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      payment_terms: body.payment_terms || null,
      default_expense_account:
        body.default_expense_account || null,
      default_ap_account:
        body.default_ap_account || null,
      risk_level: body.risk_level || "LOW",
      notes: body.notes || null,
      is_active:
        body.is_active === undefined
          ? true
          : Boolean(body.is_active),
      is_blocked: Boolean(body.is_blocked),
    });

    return NextResponse.json({
      success: true,
      vendor,
    });
  } catch (error) {
    const message =
      error.message ||
      "Vendor upsert failed";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: /required|access|membership|authentication/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
