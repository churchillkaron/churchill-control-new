import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { createRecipe } from "@/lib/inventory/production/createRecipe";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  listProductionRecipes,
} from "@/lib/inventory/production/recipes/listProductionRecipes";

async function resolveAccess(request, organizationId) {
  return requireOrganizationAccess({
    organizationId,
    request,
  });
}

function accessFailure(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
    },
    {
      status: access.status,
    },
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await resolveAccess(request, organizationId);

    if (!access.success) {
      return accessFailure(access);
    }

    const result = await listProductionRecipes({
      organizationId: access.organizationId,
      entityId: searchParams.get("entityId") || searchParams.get("entity_id") || null,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organizationId || body.organization_id;

    const access = await resolveAccess(request, organizationId);

    if (!access.success) {
      return accessFailure(access);
    }

    const entityId = body.entityId || body.entity_id;
    if (!entityId) return NextResponse.json({ success:false, error:"entityId required" }, { status:400 });
    await checkFinancePermission({ organizationId:access.organizationId, userId:access.user?.id, permissionKey:"production.manage", fullAccess:access.permissions?.includes("*")===true });
    const result = await createRecipe({
      organizationId: access.organizationId, entityId,
      actorId: access.user?.id, dish_id: body.dish_id, items: body.items,
      output_quantity: body.output_quantity, output_uom_id: body.output_uom_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      },
    );
  }
}
