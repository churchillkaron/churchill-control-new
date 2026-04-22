import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const campaign = {
      id: Date.now(),
      image: body.image,
      headline: body.headline,
      sub: body.sub,
      cta: body.cta,
      status: "ready", // 🔥 IMPORTANT: ready for posting
      createdAt: new Date().toISOString(),
    };

    // 👉 store in localStorage via frontend OR later DB
    return NextResponse.json({
      success: true,
      campaign,
    });

  } catch (err) {
    console.log(err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}