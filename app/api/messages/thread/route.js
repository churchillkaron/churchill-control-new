import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function POST(req) {

  try {

    const supabase =
      createServerSupabase();

    const body =
      await req.json();

    const {
      tenant_id,
      created_by,
      title,
      type = "private",
      participants = [],
    } = body;

    const {
      data: thread,
      error: threadError,
    } = await supabase

      .from("message_threads")

      .insert({
        tenant_id,
        created_by,
        title,
        type,
      })

      .select("*")
      .single();

    if (threadError) {
      return NextResponse.json(
        {
          success: false,
          error:
            threadError.message,
        },
        {
          status: 500,
        }
      );
    }

    const rows =
      participants.map(
        (staff_id) => ({
          tenant_id,
          thread_id:
            thread.id,
          staff_id,
        })
      );

    if (
      created_by &&
      !participants.includes(
        created_by
      )
    ) {

      rows.push({
        tenant_id,
        thread_id:
          thread.id,
        staff_id:
          created_by,
      });

    }

    if (rows.length > 0) {

      const {
        error:
          participantError,
      } = await supabase

        .from(
          "message_participants"
        )

        .insert(rows);

      if (
        participantError
      ) {

        return NextResponse.json(
          {
            success: false,
            error:
              participantError.message,
          },
          {
            status: 500,
          }
        );

      }

    }

    return NextResponse.json({
      success: true,
      thread,
    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );

  }

}
