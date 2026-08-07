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

function organizationIdFromRequest(
  request
) {
  const {
    searchParams,
  } =
    new URL(
      request.url
    );

  return (
    searchParams.get(
      "organizationId"
    ) ||
    searchParams.get(
      "organization_id"
    ) ||
    null
  );
}

export async function GET(
  request
) {
  try {
    const organizationId =
      organizationIdFromRequest(
        request
      );

    if (!organizationId) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "organizationId required",

          warehouses:
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

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "inventory_warehouses"
        )
        .select(
          "id, organization_id, name, created_at"
        )
        .eq(
          "organization_id",
          access.organizationId
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

    return NextResponse.json({
      success:
        true,

      organizationId:
        access.organizationId,

      warehouses:
        data || [],
    });
  } catch (error) {
    console.error(
      "INVENTORY WAREHOUSES GET ERROR",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          "Unable to load warehouses",

        warehouses:
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

    if (
      !organizationId ||
      !name
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "organizationId and name required",
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

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "inventory_warehouses"
        )
        .insert({
          organization_id:
            access.organizationId,

          name,
        })
        .select(
          "id, organization_id, name, created_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success:
          true,

        warehouse:
          data,
      },
      {
        status:
          201,
      }
    );
  } catch (error) {
    console.error(
      "INVENTORY WAREHOUSES POST ERROR",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          "Unable to create warehouse",
      },
      {
        status:
          500,
      }
    );
  }
}
