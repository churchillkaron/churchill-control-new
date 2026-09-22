import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export async function POST(req) {

  try {

    const body =
      await req.json();


    const access = await requireOrganizationAccess({

      organizationId: body.organizationId || body.organization_id,

      request: req,

    });


    if (!access.success) {

      return Response.json(

        { success: false, error: access.error },

        { status: access.status || 403 },

      );

    }

    const {
      data: staff,
    } = await supabaseAdmin

      .from("staff_accounts")

      .select("*")

      .eq(
        "id",
        body.staffId
      )

      .single();

    const {
      data: memories,
    } = await supabaseAdmin

      .from("ai_staff_memory")

      .select("*")

      .eq(
        "staff_id",
        body.staffId
      )

      .order(
        "score",
        {
          ascending: false,
        }
      )

      .limit(10);

    const execution =
      await ServiceExecutionRuntime.execute({

        organization_id:
          access.organizationId,

        service_id:
          "ai.text.generate",

        provider_id:
          "avantiqo-intelligence",

        input:{

          execution_lane:
            "fast",

          prompt:
`
You are Avantiqo Staff Intelligence.

Generate a concise, role-aware operational feed for this staff member.
Use only the supplied staff role and memory context. Do not assume a restaurant, hotel, nightlife, healthcare, school, workshop, or any other industry unless the evidence says so.

Prioritize:
- assigned-work awareness
- schedule or deadline awareness
- safety or compliance reminders when supported
- useful performance or completion feedback when supported
- clear next actions

Return ONLY a valid JSON array.

STAFF:
${staff?.name}

ROLE:
${staff?.role}

MEMORY:
${JSON.stringify(memories || [])}
`
        },

        metadata:{

          module:
            "STAFF",

          operation:
            "AI_FEED",

          staffId:
            body.staffId,

        },

        category:
          "AI",

      });


    const raw =
      execution?.output?.text ||
      "[]";

    let items = [];

    try {

      items =
        JSON.parse(raw);

    } catch {

      items = [];

    }

    return Response.json({

      success: true,

      items,

    });

  } catch (error) {

    return Response.json(
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
