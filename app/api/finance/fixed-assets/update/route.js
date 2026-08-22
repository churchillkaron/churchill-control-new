export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { updateFixedAssetCommand } from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

const EDITABLE_FIELDS = new Set([
  "asset_name",
  "asset_category",
  "purchase_date",
  "purchase_cost",
  "salvage_value",
  "useful_life_years",
  "depreciation_method",
  "supplier_party_id",
  "cost_center_id",
  "notes",
]);

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function editableValues(body) {
  const source = body?.values && typeof body.values === "object" && !Array.isArray(body.values)
    ? body.values
    : body || {};
  const values = {};

  for (const [key, value] of Object.entries(source)) {
    if (EDITABLE_FIELDS.has(key)) values[key] = value === "" ? null : value;
  }

  if (!Object.keys(values).length) throw new Error("No editable fixed asset fields provided");
  if (Object.prototype.hasOwnProperty.call(values, "asset_name")) {
    values.asset_name = required(values.asset_name, "asset_name");
  }
  if (Object.prototype.hasOwnProperty.call(values, "purchase_cost")) {
    values.purchase_cost = Number(values.purchase_cost);
    if (!Number.isFinite(values.purchase_cost) || values.purchase_cost <= 0) {
      throw new Error("purchase_cost must be greater than zero");
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "salvage_value")) {
    values.salvage_value = Number(values.salvage_value || 0);
    if (!Number.isFinite(values.salvage_value) || values.salvage_value < 0) {
      throw new Error("salvage_value must be zero or greater");
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "useful_life_years")) {
    values.useful_life_years = Number(values.useful_life_years);
    if (!Number.isFinite(values.useful_life_years) || values.useful_life_years <= 0) {
      throw new Error("useful_life_years must be greater than zero");
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(values, "purchase_cost") &&
    Object.prototype.hasOwnProperty.call(values, "salvage_value") &&
    values.salvage_value > values.purchase_cost
  ) {
    throw new Error("salvage_value cannot exceed purchase_cost");
  }

  return values;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|invalid|not found|editable|greater|exceed/i.test(message || "") ? 400 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await updateFixedAssetCommand({
      organization_id: access.organizationId,
      id: required(body.id || body.asset_id || body.assetId, "id"),
      values: editableValues(body),
    });

    return NextResponse.json({ success: true, asset: result });
  } catch (error) {
    const message = error.message || "Fixed asset update failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
