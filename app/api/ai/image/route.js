import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // 🔥 KEY CHANGE: DO NOT use image input
    // Use prompt to rebuild design instead

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `
Create a premium restaurant marketing post.

Use this image as inspiration (food or scene).

Style:
- Luxury beach club Phuket
- Warm orange cinematic lighting
- Deep shadows and glow highlights
- Premium branding like Churchill
- Instagram / Facebook ad style
- Clean typography space for headline

Make it feel:
- Expensive
- Atmospheric
- Designed (NOT raw photo)

DO NOT return plain photo.
Transform into a designed advertisement.
`,
        size: "1024x1024",
      }),
    });

    const data = await res.json();

    return NextResponse.json({
      image: data.data?.[0]?.url,
    });

  } catch (err) {
    return NextResponse.json(
      { error: "AI failed" },
      { status: 500 }
    );
  }
}