export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  createFixedAssetCommand,
} from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
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

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    const result = await createFixedAssetCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      asset_name: body.asset_name,
      asset_category: body.asset_category || null,
      purchase_date: body.purchase_date || null,
      purchase_cost: body.purchase_cost,
      useful_life_years: body.useful_life_years,
      salvage_value: body.salvage_value ?? 0,
      depreciation_method: body.depreciation_method || "straight_line",
      supplier_party_id: body.supplier_party_id || null,
      cost_center_id: body.cost_center_id || null,
      notes: body.notes || null,
      created_by: access.user?.id || null,
    });

    return NextResponse.json(
      result,
      { status: result?.success === false ? 400 : 200 }
    );
  } catch (error) {
    const message = error.message || "Fixed Asset creation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|greater than|cannot exceed|outside|not found/i.test(message) ? 400 : 500 }
    );
  }
}
