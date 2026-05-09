import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const body = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",

      messages: [
        {
          role: "system",
          content: `
You are a luxury hospitality marketing director.

Generate:
1. A premium Instagram/Facebook caption
2. Viral hospitality hashtags
3. A strong CTA

Keep the tone:
- cinematic
- premium
- emotional
- social
- nightlife focused
- hospitality focused

Format response EXACTLY like:

CAPTION:
...

HASHTAGS:
...

CTA:
...
`,
        },

        {
          role: "user",
          content: `
Campaign title:
${body.campaignTitle}

Event theme:
${body.eventTheme}

Campaign type:
${body.subjectType}

Mood:
${body.moodPreset}

Creative direction:
${body.extraDirection}
`,
        },
      ],
    });

   const text = completion.choices[0].message.content;

const captionMatch = text.match(/CAPTION:\s*([\s\S]*?)HASHTAGS:/i);

const hashtagsMatch = text.match(/HASHTAGS:\s*([\s\S]*?)CTA:/i);

const ctaMatch = text.match(/CTA:\s*([\s\S]*)/i);

return Response.json({
  caption: captionMatch?.[1]?.trim() || "",
  hashtags: hashtagsMatch?.[1]?.trim() || "",
  cta: ctaMatch?.[1]?.trim() || "",
});

  } catch (err) {
    console.error(err);

    return Response.json(
      {
        error: "Failed to generate campaign package",
      },
      {
        status: 500,
      }
    );
  }
}