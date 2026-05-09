import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { idea, mood, platform } = await req.json();

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: `
Create premium social media marketing copy.

Business type: luxury hospitality / beach club / restaurant in Phuket
Content idea: ${idea}
Mood: ${mood}
Platform: ${platform}

Return ONLY valid JSON:
{
  "caption": "short high-converting caption",
  "hashtags": "#hashtag #hashtag #hashtag"
}
`,
    });

    const text = response.output_text;
    const data = JSON.parse(text);

    return Response.json({
      caption: data.caption || "",
      hashtags: data.hashtags || "",
    });
  } catch (error) {
    console.error("Copy generation error:", error);

    return Response.json(
      {
        caption: "Step into a new level of hospitality.",
        hashtags: "#LuxuryHospitality #BeachClub #Phuket",
      },
      { status: 200 }
    );
  }
}