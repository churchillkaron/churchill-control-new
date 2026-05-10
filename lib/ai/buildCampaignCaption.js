import OpenAI from "openai";

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });

export default async function buildCampaignCaption({

  venue,

  campaignType,

  mood,

  atmosphere,

  subject,

}) {

  const prompt = `

You are a luxury nightlife marketing expert.

Create a high-end social media caption for:

Venue:
${venue}

Campaign Type:
${campaignType}

Mood:
${mood}

Atmosphere:
${atmosphere}

Subject:
${subject}

Rules:

- luxury nightlife tone
- exciting
- premium
- short paragraphs
- include emojis
- include CTA
- include hashtags
- optimized for Instagram + Facebook

`;

  const completion =
    await openai.chat.completions.create({

      model:
        "gpt-4.1-mini",

      messages: [

        {
          role: "system",
          content:
            "You are an elite hospitality marketing copywriter.",
        },

        {
          role: "user",
          content:
            prompt,
        },

      ],

    });

  const text =
    completion.choices?.[0]
      ?.message?.content || "";

  return {

    caption:
      text,

    hashtags: [],

    cta: "",

    fullContent:
      text,

  };

}