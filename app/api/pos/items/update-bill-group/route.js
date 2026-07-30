import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function readOrganizationId(body) {
  return body?.organizationId ?? body?.organization_id ?? null;
}

function readTableId(body) {
  return body?.tableId ?? body?.table_id ?? null;
}

function readItemIds(body) {
  const values = body?.itemIds ?? body?.item_ids ?? [];
  return Array.isArray(values) ? [...new Set(values.filter(Boolean))] : [];
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = readOrganizationId(body);
    const tableId = readTableId(body);
    const itemIds = readItemIds(body);
    const billGroup = String(body?.billGroup ?? body?.bill_group ?? "").trim();

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    if (!tableId) {
      return Response.json(
        { success: false, error: "tableId required" },
        { status: 400 }
      );
    }

    if (!itemIds.length) {
      return Response.json(
        { success: false, error: "itemIds required" },
        { status: 400 }
      );
    }

    if (!billGroup) {
      return Response.json(
        { success: false, error: "billGroup required" },
        { status: 400 }
      );
    }

    const result = await supabaseAdmin.rpc(
      "restaurant_assign_bill_group_atomic",
      {
        p_organization_id: access.organizationId,
        p_table_id: tableId,
        p_item_ids: itemIds,
        p_bill_group: billGroup,
        p_actor_id:
          access.access?.staffAccountId ||
          access.staff?.id ||
          access.user?.id ||
          null,
      }
    );

    if (result.error) {
      const missingFunction =
        result.error.code === "PGRST202" ||
        /restaurant_assign_bill_group_atomic/i.test(result.error.message || "");

      if (missingFunction) {
        return Response.json(
          {
            success: false,
            error:
              "Atomic bill-group assignment is not deployed. Apply the latest Supabase migrations.",
          },
          { status: 503 }
        );
      }

      throw result.error;
    }

    return Response.json({
      success: true,
      ...(result.data || {}),
    });
  } catch (error) {
    console.error("[UPDATE_BILL_GROUP]", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Bill group assignment failed",
      },
      { status: error?.status || 500 }
    );
  }
}
