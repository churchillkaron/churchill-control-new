export const runtime = "nodejs";

import OpenAI from "openai";


export async function POST(req) {
  try {
    const formData = await req.formData();
    const idea = formData.get("idea");

    // 🔥 MASTER PROMPT SYSTEM
    const prompt = `
Ultra realistic professional photography of: ${idea}

STYLE:
Luxury restaurant / beach club / nightlife atmosphere
Phuket, Thailand
Warm sunset lighting, cinematic tones

QUALITY:
Shot on DSLR camera
85mm lens
shallow depth of field
natural skin texture
realistic lighting
film grain subtle
NO CGI look

IMPORTANT RULES:
- NO text
- NO letters
- NO logos
- NO branding
- NO typography
- clean composition for marketing overlay

COMPOSITION:
Leave space for text overlay (left, center or right)
balanced framing
natural human presence if relevant

MOOD:
Premium, elegant, warm, inviting, high-end
`;

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    });

    const image_base64 = result.data[0].b64_json;

    return Response.json({
      image: `data:image/png;base64,${image_base64}`,
    });

  } catch (err) {
    console.error(err);
    return Response.json({ error: "Image failed" }, { status: 500 });
  }
}