import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getActiveOrganization }
from "@/lib/workspace/getActiveOrganization";

export async function GET() {

  try {

    const supabase =
      createServerSupabase();

    const organization =
      await getActiveOrganization();

    if (!organization) {

      return Response.json(
        {
          error:
            "Organization not found",
        },
        {
          status: 400,
        }
      );

    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "hotel_maintenance_tasks"
      )
      .select("*")
      .eq(
        "organization_id",
        organization.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error)
      throw error;

    return Response.json({
      tasks:
        data || [],
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
