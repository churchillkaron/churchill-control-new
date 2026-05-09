import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      idea = "",
      mood = "luxury",
      platform = "instagram",
      business = "Churchill Bar & Restaurant Phuket",
    } = body;

    const platformRules = {
      instagram: {
        contentGoal: "premium visual desire",
        tone: "aspirational, cinematic, elegant",
        format: "image-first campaign",
      },
      tiktok: {
        contentGoal: "fast hook and attention",
        tone: "high energy, direct, viral",
        format: "short-form vertical concept",
      },
      facebook: {
        contentGoal: "trust, information, conversion",
        tone: "clear, inviting, premium but practical",
        format: "caption-led campaign",
      },
    };

    const selectedPlatform =
      platformRules[platform] || platformRules.instagram;

    const strategy = {
      business,
      idea,
      mood,
      platform,

      campaignAngle: buildCampaignAngle(idea, mood),
      targetAudience: [
        "wealthy tourists in Phuket",
        "premium nightlife guests",
        "couples and groups looking for a high-end evening",
        "influencers and lifestyle travelers",
      ],

      targetEmotion: getTargetEmotion(mood),
      coreMessage: buildCoreMessage(idea),
      hook: buildHook(idea, mood),

      platformStrategy: selectedPlatform,

      visualDirection: {
        atmosphere: "dark luxury, warm gold light, cinematic restaurant-bar mood",
        locationFeeling: "exclusive Phuket nightlife, not beach club, not resort",
        composition:
          "environment-first, drinks, lighting, atmosphere, stylish guests, no focused faces",
        camera:
          "realistic photography, shallow depth of field, slight grain, natural imperfections",
      },

      copyDirection: {
        tone: selectedPlatform.tone,
        cta: getCTA(platform),
        avoid: [
          "cheap wording",
          "generic nightlife slogans",
          "over-promising",
          "beach club language",
        ],
      },

      successCriteria: {
        brandFit: "Must feel premium, mysterious, and high-status",
        visualImpact: "Must stop scrolling within 1 second",
        conversionGoal: "Encourage table reservation or visit",
      },
    };

    return NextResponse.json({
      success: true,
      strategy,
    });
  } catch (error) {
    console.error("Strategy engine error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to build strategy",
      },
      { status: 500 }
    );
  }
}

function buildCampaignAngle(idea, mood) {
  return `A ${mood} Churchill Phuket campaign built around ${idea}, positioned as an exclusive nightlife experience for premium guests.`;
}

function getTargetEmotion(mood) {
  if (mood.includes("luxury")) return "desire, exclusivity, curiosity";
  if (mood.includes("party")) return "energy, excitement, urgency";
  if (mood.includes("romantic")) return "intimacy, warmth, elegance";
  return "curiosity, attraction, premium lifestyle";
}

function buildCoreMessage(idea) {
  return `Churchill is not just a place to go out — it is where a premium Phuket night begins. Concept focus: ${idea}.`;
}

function buildHook(idea, mood) {
  if (mood.includes("luxury")) {
    return "Some nights in Phuket are not for everyone.";
  }

  if (mood.includes("party")) {
    return "Tonight belongs to Churchill.";
  }

  return `Discover Churchill through ${idea}.`;
}

function getCTA(platform) {
  if (platform === "tiktok") return "Watch the night unfold.";
  if (platform === "facebook") return "Reserve your table at Churchill Phuket.";
  return "Reserve your table.";
}