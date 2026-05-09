import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();
    const { strategy } = body;

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: "Missing strategy" },
        { status: 400 }
      );
    }

    const copy = generateCopy(strategy);

    return NextResponse.json({
      success: true,
      copy,
    });
  } catch (error) {
    console.error("Copy engine error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Copy generation failed",
      },
      { status: 500 }
    );
  }
}

function generateCopy(strategy) {
  const hook = buildHook(strategy);
  const caption = buildCaption(strategy);
  const cta = strategy.copyDirection.cta;

  return {
    hook,
    caption,
    cta,
    hashtags: buildHashtags(),
    variations: [
      `${hook} ${cta}`,
      caption,
      `${hook} ${caption}`,
    ],
  };
}

function buildHook(strategy) {
  return strategy.hook || "Some nights are not for everyone.";
}

function buildCaption(strategy) {
  return `
${strategy.hook}

${strategy.coreMessage}

Step into ${strategy.business}.
Where atmosphere defines the night.

${strategy.copyDirection.cta}
`.trim();
}

function buildHashtags() {
  return "#PhuketNightlife #LuxuryDining #CocktailExperience #PhuketLuxury #FineDiningPhuket #NightlifePhuket";
}