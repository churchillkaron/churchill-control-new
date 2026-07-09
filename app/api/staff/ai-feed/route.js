import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export async function POST(req) {

  try {

    const body =
      await req.json();

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
          body.organizationId,

        service_id:
          "ai.text.generate",

        provider_id:
          "openai",

        input:{

          model:
            "gpt-4o-mini",

          prompt:
`
You are Churchill AI.

Generate a luxury hospitality realtime feed.

Tone:
- elite
- premium
- nightlife luxury
- emotionally engaging
- futuristic
- competitive

Return ONLY valid JSON array.

STAFF:
${staff?.name}

ROLE:
${staff?.role}

MEMORY:
${JSON.stringify(memories || [])}

Generate:
- VIP alerts
- performance updates
- motivational feed
- nightlife luxury atmosphere
- elite competition energy
`,
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
