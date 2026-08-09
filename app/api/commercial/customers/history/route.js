export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function tableReference(table, session) {
  return (
    table?.table_number ||
    table?.table_name ||
    session?.table_number ||
    null
  );
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id ||
        null,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status || 403,
        }
      );
    }

    const partyId =
      body.partyId ||
      body.party_id ||
      null;

    const customerPhone =
      String(
        body.customerPhone ||
        body.customer_phone ||
        ""
      ).trim();

    if (!partyId && !customerPhone) {
      return NextResponse.json({
        success: true,
        history: [],
      });
    }

    let sessionQuery = supabaseAdmin
      .from("table_sessions")
      .select(
        "id, table_id, table_number, party_id, customer_phone"
      )
      .eq(
        "organization_id",
        access.organizationId
      );

    if (partyId) {
      sessionQuery = sessionQuery.eq(
        "party_id",
        partyId
      );
    } else {
      sessionQuery = sessionQuery.eq(
        "customer_phone",
        customerPhone
      );
    }

    const sessionResult =
      await sessionQuery;

    if (sessionResult.error) {
      throw sessionResult.error;
    }

    const sessions =
      sessionResult.data || [];

    const sessionIds = sessions
      .map((session) => session.id)
      .filter(Boolean);

    if (!sessionIds.length) {
      return NextResponse.json({
        success: true,
        history: [],
      });
    }

    const orderResult = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq(
        "organization_id",
        access.organizationId
      )
      .in("session_id", sessionIds)
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (orderResult.error) {
      throw orderResult.error;
    }

    const tableIds = [
      ...new Set(
        sessions
          .map((session) => session.table_id)
          .filter(Boolean)
      ),
    ];

    let tables = [];

    if (tableIds.length) {
      const tableResult = await supabaseAdmin
        .from("restaurant_tables")
        .select(
          "id, table_number, table_name"
        )
        .eq(
          "organization_id",
          access.organizationId
        )
        .in("id", tableIds);

      if (tableResult.error) {
        throw tableResult.error;
      }

      tables = tableResult.data || [];
    }

    const sessionById = new Map(
      sessions.map((session) => [
        session.id,
        session,
      ])
    );

    const tableById = new Map(
      tables.map((table) => [
        table.id,
        table,
      ])
    );

    const history = (
      orderResult.data || []
    ).map((order) => {
      const session =
        sessionById.get(order.session_id) ||
        null;

      const table =
        tableById.get(
          order.table_id ||
          session?.table_id
        ) ||
        null;

      const reference =
        tableReference(
          table,
          session
        );

      return {
        ...order,

        items:
          Array.isArray(order.order_items)
            ? order.order_items
            : [],

        table_reference:
          reference,

        context: {
          type:
            "service_location",

          id:
            table?.id ||
            order.table_id ||
            session?.table_id ||
            null,

          reference:
            reference == null
              ? null
              : String(reference),

          label:
            reference == null
              ? "Unassigned service location"
              : `Table ${reference}`,
        },
      };
    });

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error(
      "CUSTOMER HISTORY ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to load customer history",
      },
      {
        status: 500,
      }
    );
  }
}
