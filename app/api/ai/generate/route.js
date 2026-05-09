import OpenAI from "openai";



export async function POST(req) {
  try {
    const { prompt } = await req.json();

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      n: 1,
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    return Response.json({
      url: `data:image/png;base64,${imageBase64}`,
    });
  } catch (error) {
    console.error("Image generation error:", error);

    return Response.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}