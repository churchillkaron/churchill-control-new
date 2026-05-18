import { NextResponse } from "next/server";

import createAlert from "@/lib/alerts/createAlert";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      kitchen_ticket_id,
      status,
    } = body;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("kitchen_tickets")
      .update({

        status,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        kitchen_ticket_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (
      status === "READY"
    ) {

      await createAlert({

        tenant_id:
          data.tenant_id,

        message:
          `Kitchen order ready: ${data.id}`,

        severity:
          "success",
      });
    }

    return NextResponse.json({

      success: true,

      kitchen_ticket:
        data,
    });

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
