import OpenAI from "openai";



export async function POST(req) {
  try {
    const { idea } = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Create a short Instagram caption and 5 hashtags for: ${idea}`,
        },
      ],
    });

    const text = completion.choices[0].message.content;

    const parts = text.split("\n");

    return Response.json({
      caption: parts[0],
      hashtags: parts.slice(1).map((t) => t.replace("#", "")),
    });

  } catch (err) {
    console.error(err);

    return Response.json({
      caption: "Luxury beach vibes await you 🌅",
      hashtags: ["beachclub", "luxury", "cocktails"],
    });
  }
}