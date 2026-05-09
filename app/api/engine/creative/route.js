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

    const directions = generateCreativeDirections(strategy);

    return NextResponse.json({
      success: true,
      directions,
    });
  } catch (error) {
    console.error("Creative engine error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Creative generation failed",
      },
      { status: 500 }
    );
  }
}

// =============================
// CREATIVE DIRECTIONS
// =============================
function generateCreativeDirections(strategy) {
  const base = basePrompt(strategy);

  return [
    {
      name: "Cinematic Luxury",
      concept:
        "High-end cinematic atmosphere focusing on lighting, depth, and exclusivity",
      focus: "environment + lighting + premium drinks",
      prompt: `${base}
Style: cinematic luxury photography
Lighting: moody, warm gold highlights, deep shadows
Composition: wide shots, layered depth, foreground drinks, background crowd
Energy: calm, powerful, exclusive`,
    },

    {
      name: "Social Energy",
      concept:
        "Lively nightlife energy showing movement, crowd, and dynamic atmosphere",
      focus: "people movement + energy + interaction",
      prompt: `${base}
Style: nightlife documentary style
Lighting: contrast, mixed lighting, real bar conditions
Composition: movement, blur, candid shots, energy moments
Energy: high, social, spontaneous`,
    },

    {
      name: "Minimal Prestige",
      concept:
        "Clean, elegant, minimal compositions focusing on product and design",
      focus: "cocktails + table + details",
      prompt: `${base}
Style: minimalist luxury editorial
Lighting: soft spotlight, subtle shadows
Composition: off-center object, natural framing, imperfect balance
Energy: quiet, elegant, premium`,
    },
  ];
}

// =============================
// BASE PROMPT (FIXED)
// =============================
function basePrompt(strategy) {
  return `

  EDITING MODE:

Preserve the environment from the reference images.
Do NOT redesign the bar.

ONLY modify:
- drinks
- lighting mood
- small foreground elements

DO NOT change:
- structure
- layout
- walls
- furniture
SHOT ORIGIN:

image taken handheld, slightly unstable
not tripod, not staged
slight tilt or imperfect framing

DOF inconsistency:
some areas unintentionally out of focus

This is NOT a professional shoot.
This is a real moment captured.

The bar must remain identical to the real images.

Ultra realistic photo of a premium cocktail bar scene at night
REFERENCE STYLE (VERY IMPORTANT):

Use real-world reference images for lighting, composition, and realism:
- real cocktail bar photography
- natural nightlife photos (not staged shoots)
- imperfect social media photos from real venues

Match:
- lighting inconsistency
- real camera exposure
- natural grain and noise
- imperfect composition

DO NOT create a “designed” image.
This must feel like it was taken from a real camera roll.
PRIMARY SUBJECT:
${strategy.idea} (main focus)
SUBJECT DETAILS:

- if food: focus on texture, ingredients, plating, realism
- if drinks: condensation, glass reflections, garnish details
- if mixed: balance food + drinks naturally

Subject must clearly match the idea provided.

STRICT MATCH:

The main subject MUST match the idea exactly.
If the idea is food, do NOT generate drinks as the main subject.
If the idea is burgers, burgers must be clearly visible and dominant.

STRICT RULES:
- NO text in image
- NO logos
- NO brand names visible anywhere

ENVIRONMENT:
- dark luxury bar
- warm golden lighting
- realistic restaurant atmosphere
- background slightly busy but blurred

COMPOSITION:
- NOT symmetrical
- NOT centered perfectly
- slightly imperfect framing
- looks like taken by a real photographer in the moment

SCENE:
${strategy.idea}

DRINK DETAILS:
- condensation on glass
- reflections imperfect
- garnish slightly irregular
- liquid not perfectly clean
- real bar presentation (not catalog style)

HUMANS:
- optional
- blurred background only
- never main subject

LIGHTING:
- uneven lighting
- shadows visible
- highlights on glass
- slight overexposure in spots

CAMERA:
- Sony A7S III
- 50mm lens
- f/1.8
- shallow depth of field

REALISM:
- slight noise in dark areas
- slight blur in background
- not overly sharp
- no CGI look

IMPERFECTIONS:
- table not perfectly clean
- objects slightly misaligned
- reflections slightly broken

MOOD:
${strategy.targetEmotion}

REAL CAMERA BEHAVIOR:

- slightly underexposed overall image
- highlights slightly blown on glass reflections
- some areas too dark (not perfectly balanced exposure)
- white balance slightly warm (not perfect)
- subtle ISO noise in shadows
- motion blur in background movement

FOCUS IMPERFECTION:

- focus slightly off (not perfectly sharp subject)
- depth of field uneven (edges softer)
- background blur not perfectly smooth

SHOT FEEL:

- taken quickly in real nightlife environment
- not staged, not planned
- photographer reacting to moment

LENS ARTIFACTS:

- slight lens distortion
- subtle chromatic aberration on edges
- imperfect reflections

IMPORTANT:

image should feel like a real photo taken during a busy night, not a designed marketing image

GOAL:
must look like a real photo taken during a night out, not AI generated
FINAL CHECK:

If the image looks too perfect, too clean, or too symmetrical → make it worse and more natural
`;
}