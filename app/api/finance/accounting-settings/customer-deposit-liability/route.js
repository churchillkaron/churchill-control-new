export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import {
  getCustomerDepositLiabilityConfiguration,
  setCustomerDepositLiabilityConfiguration,
} from "@/lib/finance/accounting-settings/customerDepositLiabilityConfiguration";

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (
    normalized.includes("required") ||
    normalized.includes("must") ||
    normalized.includes("not found") ||
    normalized.includes("configure") ||
    normalized.includes("different rule") ||
    normalized.includes("multiple")
  ) {
    return 400;
  }
  return 500;
}

async function listLiabilityAccounts({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select(
      "id, account_code, account_name, account_category, account_type, normal_balance"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .order("account_code", { ascending: true });

  if (error) throw error;

  return (data || [])
    .filter((account) => {
      const classification = `${account.account_category || ""} ${account.account_type || ""}`
        .trim()
        .toUpperCase();
      const normalBalance = String(account.normal_balance || "").trim().toUpperCase();
      return classification.includes("LIABIL") && (!normalBalance || normalBalance === "CREDIT");
    })
    .map((account) => ({
      id: account.id,
      code: account.account_code,
      name: account.account_name,
    }));
}

async function resolveAccess({ request, organizationId, operation }) {
  const access = await requireOrganizationAccess({ organizationId, request });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      ),
    };
  }

  await requireFinanceWorkspacePermission({
    capabilityId: "accounting_settings",
    operation,
    access,
  });

  return { access };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = queryValue(searchParams, "organizationId", "organization_id");
    const entityId = queryValue(searchParams, "entityId", "entity_id");
    const effectiveDate = queryValue(searchParams, "effectiveDate", "effective_date") ||
      new Date().toISOString().slice(0, 10);

    const resolved = await resolveAccess({
      request,
      organizationId,
      operation: "read",
    });
    if (resolved.response) return resolved.response;

    const configuration = await getCustomerDepositLiabilityConfiguration({
      organizationId: resolved.access.organizationId,
      entityId,
      effectiveDate,
    });
    const liabilityAccounts = await listLiabilityAccounts({
      organizationId: resolved.access.organizationId,
      entityId,
    });

    return NextResponse.json({
      success: true,
      configuration,
      liability_accounts: liabilityAccounts,
    });
  } catch (error) {
    const message = error.message || "Customer deposit accounting setup could not be loaded";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organizationId || body.organization_id;
    const entityId = body.entityId || body.entity_id;
    const liabilityAccountId =
      body.liabilityAccountId || body.liability_account_id;
    const effectiveDate = body.effectiveDate || body.effective_date;

    const resolved = await resolveAccess({
      request,
      organizationId,
      operation: "write",
    });
    if (resolved.response) return resolved.response;

    const configuration = await setCustomerDepositLiabilityConfiguration({
      organizationId: resolved.access.organizationId,
      entityId,
      liabilityAccountId,
      effectiveDate,
      configuredBy: resolved.access.user?.id || null,
    });

    return NextResponse.json({ success: true, configuration });
  } catch (error) {
    const message = error.message || "Customer deposit accounting setup could not be saved";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
