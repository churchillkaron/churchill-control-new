import { createServerSupabase }
from "@/lib/shared/supabase/server";

export async function POST(req) {

  try {

    const supabase =
      createServerSupabase();

    const {
      taskId,
      status,
    } = await req.json();

    const {
      data,
      error,
    } = await supabase
      .from(
        "hotel_housekeeping_tasks"
      )
      .update({
        status,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        taskId
      )
      .select()
      .single();

    if (error)
      throw error;

    return Response.json({
      success: true,
      task: data,
    });

  } catch (error) {

    return Response.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
