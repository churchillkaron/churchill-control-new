import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { createRecipe } from "@/lib/inventory/production/createRecipe";
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

    const result = await createRecipe({
      organizationId: access.organizationId,
      dish_id: body.dish_id,
      items: body.items,
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
