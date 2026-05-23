import OpenAI from "openai";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });

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

    const completion =
      await openai.chat.completions.create({

        model: "gpt-4o-mini",

        messages: [

          {
            role: "system",

            content: `
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

Example:
[
  {
    "text": "Emma reached #1 in champagne sales"
  }
]
`,
          },

          {
            role: "user",

            content: `
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

        ],

      });

    const raw =
      completion
        .choices?.[0]
        ?.message
        ?.content || "[]";

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
