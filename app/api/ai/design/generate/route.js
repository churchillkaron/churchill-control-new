
export const runtime = "nodejs";
import OpenAI from "openai";



export async function POST(req) {
  try {
    const { prompt, hd } = await req.json();

    const size = hd ? "2048x2048" : "1024x1024";

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
    });

    return Response.json({
      url: result.data[0].url,
    });

  } catch (error) {
    console.error(error);

    return Response.json({
      url: "/bg-beach.jpg",
    });
  }
}