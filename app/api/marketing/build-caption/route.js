export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { businessProfiles }
from "@/lib/business/config/businessProfiles";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const sanitize = (text = "") =>

  text
    .replace(/abba/gi, "retro disco")
    .replace(/taylor swift/gi, "pop concert")
    .replace(/beyonce/gi, "live music event");


export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const {

  venue,

  campaignType,

  mood,

  atmosphere,

  subject,

} = body;

const businessKey =

  venue ||

  "default";

const profile =

  businessProfiles[
    businessKey
  ] ||

  businessProfiles.default ||
  {};

    const prompt = `

You are an elite hospitality and nightlife marketing copywriter.

Create:

1. Premium Instagram caption
2. Engaging marketing copy
3. CTA
4. Relevant hashtags

Business:
${venue}

Campaign:
${sanitize(campaignType)}

Mood:
${mood}

Atmosphere:
${atmosphere}

Subject:
${sanitize(subject)}

BUSINESS TYPE:
${profile?.type}

AUDIENCE:
${profile?.audience}

BRAND TONE:
${profile?.tone}

MARKETING STYLE:
${profile?.style}

AVOID:
${profile?.avoid?.join(", ")}

Return ONLY valid JSON:

{
  "caption": "...",
  "hashtags": ["#one", "#two"],
  "fullContent": "..."
}

`;

    const execution =
      await ServiceExecutionRuntime.execute({

        organization_id:
          body.organizationId,

        service_id:
          "ai.text.generate",

        provider_id:
          "openai",

        input:{

          prompt,

          model:
            "gpt-4.1-mini",

        },

        metadata:{

          module:
            "MARKETING",

          operation:
            "BUILD_CAPTION",

        },

        category:
          "AI",

      });


    const raw =
      execution?.output?.text ||
      "";

    if (process.env.NODE_ENV !== "production") console.log(
      "CAPTION RAW:",
      raw
    );

    const parsed =
      JSON.parse(raw);

    return NextResponse.json({

      success: true,

      caption:
        parsed.caption,

      hashtags:
        parsed.hashtags,

      fullContent:
        parsed.fullContent,

    });

  } catch (err) {

    console.error(
      "BUILD CAPTION ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          err.message,

        caption: "",

        hashtags: [],

        fullContent: "",

      },

      {

        status: 500,

      }

    );

  }

}