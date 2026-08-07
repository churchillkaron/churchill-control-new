export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function accessError(
  access
) {
  return NextResponse.json(
    {
      success:
        false,

      error:
        access.error,
    },
    {
      status:
        access.status,
    }
  );
}

function isUuid(
  value
) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(
      String(
        value ||
        ""
      )
    );
}

async function listOrganizationWarehouses(
  organizationId
) {
  const result =
    await supabaseAdmin
      .from(
        "inventory_warehouses"
      )
      .select(
        "id, organization_id, name, created_at"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );

  if (result.error) {
    throw result.error;
  }

  return result.data || [];
}

async function resolveWarehouse({
  organizationId,
  warehouseReference,
}) {
  if (!warehouseReference) {
    return null;
  }

  let query =
    supabaseAdmin
      .from(
        "inventory_warehouses"
      )
      .select(
        "id, organization_id, name, created_at"
      )
      .eq(
        "organization_id",
        organizationId
      );

  query =
    isUuid(
      warehouseReference
    )
      ? query.eq(
          "id",
          warehouseReference
        )
      : query.eq(
          "name",
          String(
            warehouseReference
          ).trim()
        );

  const result =
    await query
      .limit(
        1
      )
      .maybeSingle();

  if (
    result.error &&
    result.error.code !==
      "PGRST116"
  ) {
    throw result.error;
  }

  return result.data || null;
}

export async function GET(
  request
) {
  try {
    const {
      searchParams,
    } =
      new URL(
        request.url
      );

    const organizationId =
      searchParams.get(
        "organizationId"
      ) ||
      searchParams.get(
        "organization_id"
      );

    const requestedWarehouse =
      searchParams.get(
        "warehouseId"
      ) ||
      searchParams.get(
        "warehouse_id"
      ) ||
      null;

    if (!organizationId) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "organizationId required",

          locations:
            [],
        },
        {
          status:
            400,
        }
      );
    }

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return accessError(
        access
      );
    }

    const warehouses =
      await listOrganizationWarehouses(
        access.organizationId
      );

    let scopedWarehouses =
      warehouses;

    if (requestedWarehouse) {
      scopedWarehouses =
        warehouses.filter(
          warehouse =>
            warehouse.id ===
            requestedWarehouse
        );

      if (
        scopedWarehouses.length ===
        0
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "Warehouse does not belong to this organization",

            locations:
              [],
          },
          {
            status:
              404,
          }
        );
      }
    }

    const warehouseIds =
      scopedWarehouses.map(
        warehouse =>
          warehouse.id
      );

    if (
      warehouseIds.length ===
      0
    ) {
      return NextResponse.json({
        success:
          true,

        organizationId:
          access.organizationId,

        locations:
          [],
      });
    }

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "inventory_locations"
        )
        .select(
          "id, warehouse_id, name, created_at"
        )
        .in(
          "warehouse_id",
          warehouseIds
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        );

    if (error) {
      throw error;
    }

    const warehouseById =
      new Map(
        scopedWarehouses.map(
          warehouse => [
            warehouse.id,
            warehouse,
          ]
        )
      );

    const locations =
      (
        data ||
        []
      ).map(
        location => ({
          ...location,

          warehouse_name:
            warehouseById.get(
              location.warehouse_id
            )?.name ||
            null,
        })
      );

    return NextResponse.json({
      success:
        true,

      organizationId:
        access.organizationId,

      locations,
    });
  } catch (error) {
    console.error(
      "INVENTORY LOCATIONS GET ERROR",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          "Unable to load inventory locations",

        locations:
          [],
      },
      {
        status:
          500,
      }
    );
  }
}

export async function POST(
  request
) {
  try {
    const body =
      await request.json();

    const organizationId =
      body.organizationId ||
      body.organization_id ||
      null;

    const name =
      String(
        body.name ||
        ""
      ).trim();

    const warehouseReference =
      body.warehouseId ||
      body.warehouse_id ||
      body.warehouse ||
      null;

    if (
      !organizationId ||
      !name ||
      !warehouseReference
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "organizationId, warehouseId and name required",
        },
        {
          status:
            400,
        }
      );
    }

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return accessError(
        access
      );
    }

    const warehouse =
      await resolveWarehouse({
        organizationId:
          access.organizationId,

        warehouseReference,
      });

    if (!warehouse) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Warehouse does not belong to this organization",
        },
        {
          status:
            404,
        }
      );
    }

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "inventory_locations"
        )
        .insert({
          warehouse_id:
            warehouse.id,

          name,
        })
        .select(
          "id, warehouse_id, name, created_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success:
          true,

        location: {
          ...data,

          warehouse_name:
            warehouse.name,
        },
      },
      {
        status:
          201,
      }
    );
  } catch (error) {
    console.error(
      "INVENTORY LOCATIONS POST ERROR",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          "Unable to create inventory location",
      },
      {
        status:
          500,
      }
    );
  }
}
