import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      error,
    } = await supabaseAdmin

      .from("ai_staff_memory")

      .insert({

        tenant_id:
          body.tenantId,

        staff_id:
          body.staffId,

        memory_type:
          body.memoryType,

        memory_value:
          body.memoryValue,

        score:
          body.score || 0,

      });

    if (error)
      throw error;

    return Response.json({
      success: true,
    });

  } catch (error) {

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }

}
