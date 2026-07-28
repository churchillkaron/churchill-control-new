export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { listAccountsCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");
    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, accounts: [], rows: [] },
        { status: access.status }
      );
    }

    if (!entityId) {
      throw new Error("entityId required");
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });
    if (!entity) {
      throw new Error("Legal entity not found in organisation");
    }

    const accounts = await listAccountsCommand({
      organizationId: access.organizationId,
      entityId: entity.id,
    });

    const metrics = {
      totalCount: accounts.length,
      activeCount: accounts.filter(account => account.is_active !== false).length,
      inactiveCount: accounts.filter(account => account.is_active === false).length,
      systemCount: accounts.filter(account => account.is_system === true).length,
    };

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      accounts,
      rows: accounts,
      metrics,
    });
  } catch (error) {
    const message = error.message || "Chart of accounts load failed";
    return NextResponse.json(
      { success: false, error: message, accounts: [], rows: [] },
      { status: /required|not found/i.test(message) ? 400 : 500 }
    );
  }
}
