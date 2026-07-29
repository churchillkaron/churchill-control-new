export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertFinanceDimension } from "@/lib/finance/dimensions/FinanceDimensionPolicy";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.accounting.manage",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await upsertFinanceDimension({
      organizationId: access.organizationId,
      payload: body,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Dimension save failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|select|scope|entity|effective|dimension|name|code/i.test(message) ? 400 : 500 }
    );
  }
}
