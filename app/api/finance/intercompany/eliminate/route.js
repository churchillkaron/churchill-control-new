export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { runIntercompanyEliminationCommand } from "@/lib/finance/intercompany/runtime/IntercompanyApplicationService";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await runIntercompanyEliminationCommand({
      organizationId: access.organizationId,
      reconciliationId: body.reconciliationId,
      eliminationAmount: body.eliminationAmount,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
