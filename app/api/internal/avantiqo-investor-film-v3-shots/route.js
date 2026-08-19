export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";
const SOURCE = "avantiqo_investor_film_v3_missing_shots_20260819";

const COMMON_OUTPUT = {
  duration_seconds: 10,
  aspect_ratio: "16:9",
};

const COMMON_REQUIREMENTS = {
  visual_quality:
    "world-class photoreal feature-film cinematography for a premium global technology investor film, natural and credible rather than glossy generic AI advertising",
  realism:
    "natural human movement, realistic anatomy and physics, believable wardrobe and props, practical production design, realistic skin and restrained performance",
  camera_language:
    "motivated cinema camera only, stable geometry, subtle dolly or tracking movement, natural 24fps motion language, no frantic montage inside one generated shot",
  lighting:
    "premium practical lighting, soft highlight rolloff, deep neutral blacks, realistic skin tones, restrained cinematic contrast",
  screen_policy:
    "Every visible phone, tablet, laptop or monitor must remain deep charcoal to near-black with subtle low-contrast placeholder blocks only. No readable generated software text, no fake Avantiqo interface, no white browser pages, no invented logos. Screens must remain geometrically stable and perspective-friendly for deterministic replacement with authentic Avantiqo UI in post.",
  negative_constraints: [
    "no fake generated Avantiqo UI",
    "no readable generated software text",
    "no invented logos",
    "no white device screens",
    "no bright generic dashboards",
    "no sci-fi holograms",
    "no glowing holographic UI",
    "no floating fake text",
    "no warped hands",
    "no distorted devices",
    "no synthetic skin",
    "no exaggerated corporate acting",
    "no staged smiling at camera",
    "no speed-ramped montage",
    "no multiple unrelated story ideas inside the same shot",
  ],
};

const SCENES = {
  restaurant_opening: {
    title: "Investor Film V3 — The Business Wakes Up",
    editorial_role: "0:00-0:22 opening world-building",
    description:
      "A single ten-second cinematic opening shot inside a premium restaurant just before service begins in Phuket. The space starts quiet and partially prepared. A real service team enters the frame naturally, one employee turns on a practical light, another finishes setting a table, and a chef passes in the deep background toward the kitchen. The camera performs one slow controlled lateral move through the room as the business visibly comes alive. No software is shown and nobody performs for camera. The scene should feel observed, human and expensive, like the opening of a feature film rather than a SaaS commercial.",
    intent: {
      story_purpose:
        "Establish that a company is a living physical system before Avantiqo or software is introduced.",
      emotional_tone: "quiet confidence, anticipation, human, premium, real",
      story_state_change: "the dormant venue becomes an operating business",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "elegant contemporary Phuket restaurant before service, believable tables, bar and distant kitchen activity",
      subject:
        "professional hospitality team in understated workwear, no visible brand marks",
      action:
        "team enters normal pre-service rhythm while one practical light comes on and a table is completed",
      composition:
        "one continuous slow lateral track with foreground depth and natural staff movement across layers",
      screen_policy: "No device or software screen needs to be visible in this shot.",
      audio_policy:
        "natural room tone, distant cutlery, chair movement, low kitchen ambience; no dialogue and no generated narration",
    },
    frame_contract: {
      opening: "quiet prepared room with only subtle early activity",
      progression: "staff movement and practical light make the venue feel increasingly alive",
      closing: "the restaurant is visibly operating and ready for service",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  operator_fragmented: {
    title: "Investor Film V3 — The Operator Is the Integration Layer",
    editorial_role: "0:50-1:15 fractured-company problem section",
    description:
      "A ten-second premium cinematic shot of a credible hands-on business owner or general manager in a refined practical office overlooking a live operation through glass. He begins calmly reviewing work on a laptop. A phone vibrates with a restrained alert, he checks it, returns attention to the laptop, then a second nearby business device gives another subtle alert. He briefly holds the information in his head and looks toward the active operation beyond the glass. He is competent and composed, not stressed or theatrical. The point is that one human is being forced to connect disconnected information sources. The camera performs one slow controlled push-in for the full shot.",
    intent: {
      story_purpose:
        "Show fragmentation through one human experience instead of explaining disconnected systems with graphics.",
      emotional_tone: "intelligent, calm, subtly burdened, credible",
      story_state_change:
        "a normal working moment becomes a visible example of the operator manually integrating separate systems",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "quiet practical operator office with active hospitality or service operation visible beyond glass",
      subject:
        "experienced hands-on owner or general manager around 40 to 50, understated smart-casual clothing",
      action:
        "review laptop, respond to one phone alert, return to laptop, notice one second device alert, look toward operation",
      composition:
        "over-shoulder three-quarter framing with devices visible but human performance dominant, one restrained slow push-in",
      audio_policy:
        "ambient office and distant operations, one subtle phone vibration, one restrained second device tone; no dialogue and no generated narration",
    },
    screen_replacement: {
      avantiqo_workspace: "none; this is still the pre-Avantiqo problem section",
      replacement_window: "screens remain dark and replaceable throughout if editorially needed",
    },
    frame_contract: {
      opening: "operator calmly focused on laptop",
      progression: "two separate notification sources interrupt the same work rhythm",
      closing: "operator looks from devices toward the real operation he is responsible for",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  avantiqo_reveal: {
    title: "Investor Film V3 — Avantiqo Cinematic Interface Reveal Plate",
    editorial_role: "1:15-1:40 first Avantiqo reveal",
    description:
      "A ten-second premium cinematic technology shot designed specifically for deterministic Avantiqo interface compositing. A hands-on general manager sits at a refined desk overlooking a real operating business through glass. A laptop is open in front of the manager with a large deep-charcoal blank replacement-friendly screen. The manager studies the laptop for a beat, makes one deliberate trackpad click around second three, then becomes still and attentive while the camera eases slightly backward and upward, preserving the laptop screen and creating clean negative space directly above and slightly in front of the device for a later transparent Avantiqo interface layer to rise into the viewer's field of view. The manager's eyes follow that space subtly as if information has become clearer, but there must be no generated hologram, fake interface, glow, text or logo in the source plate. The physical performance and camera move must leave a clean six-second VFX window after the click.",
    intent: {
      story_purpose:
        "Create the hero live-action plate for the signature Avantiqo screen-rise reveal without trusting generative video to invent the product interface.",
      emotional_tone: "revelatory, controlled, intelligent, premium, calm",
      story_state_change:
        "the operator moves from looking at a device to having the company's operating context presented clearly to the viewer",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "refined practical manager office overlooking a real hospitality or service operation through glass",
      subject:
        "credible operator or general manager, understated smart-casual workwear",
      action:
        "study laptop, one deliberate trackpad click near second three, then hold a calm attentive posture through the end",
      composition:
        "laptop screen large and nearly rectangular in lower-middle frame; after click, camera eases slightly back and up to create clean negative space above the laptop while keeping device geometry stable",
      vfx_plate_policy:
        "No floating panel is generated. Preserve unobstructed negative space above the laptop and stable perspective so post-production can animate authentic Avantiqo UI rising from the device plane as a transparent cinematic glass layer.",
      audio_policy:
        "quiet operational ambience and one subtle trackpad click only; no dialogue, narration or generated music",
    },
    screen_replacement: {
      avantiqo_workspace:
        "Organization Intelligence / Operations Command Center with authentic Avantiqo UI only",
      screen_action:
        "At approximately second 3, deterministic post-production begins: authentic Avantiqo UI rises from the laptop plane, tilts gently toward camera, becomes a transparent dark-glass viewer layer, holds readable for several seconds, then transitions into the next scene.",
      replacement_window: "approximately seconds 2.5 to 9.8",
      effect: "TRANSPARENT_UI_RISE_FROM_DEVICE",
      effect_policy:
        "real Avantiqo interface only; no generated fake UI; restrained glass transparency, minimal edge light, realistic perspective, no hologram styling",
    },
    frame_contract: {
      opening: "manager and dark laptop screen clearly established in one calm frame",
      progression: "single click near second three, followed by gentle camera release backward/upward and a long clean VFX hold",
      closing: "manager remains composed, laptop and negative space stable for the full interface reveal",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  field_dispatch: {
    title: "Investor Film V3 — Field Service Dispatch",
    editorial_role: "1:40-2:35 complete field-service story",
    description:
      "A ten-second cinematic field-service operations shot in a small premium service-company office in Phuket. A dispatcher or operations coordinator reviews the day's jobs on a desktop monitor with a deep-charcoal replacement-friendly screen. A technician in clean workwear is visible nearby preparing to leave. The dispatcher makes one deliberate confirmation click, glances toward the technician, and gives one small natural nod. The technician picks up a compact equipment case and moves toward the exit. No dialogue, no theatrical gestures. One operational decision becomes physical action.",
    intent: {
      story_purpose:
        "Show the exact handoff from office coordination to a real field technician before the service visit begins.",
      emotional_tone: "organized, competent, human, efficient",
      story_state_change: "an assigned job becomes dispatched field work",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "credible Phuket field-service office with dispatch desk, practical storage and technician departure path",
      subject:
        "professional dispatcher and one field technician in clean unbranded service workwear",
      action:
        "dispatcher confirms one assignment, acknowledges technician, technician picks up equipment case and heads toward exit",
      composition:
        "controlled medium-wide composition with monitor readable for replacement and technician movement crossing into depth",
      audio_policy:
        "quiet office ambience, subtle mouse click, equipment case movement and door sound; no dialogue and no generated narration",
    },
    screen_replacement: {
      avantiqo_workspace: "Field Service / Dispatch / Technician Assignment",
      screen_action:
        "show one real job card, appointment window and technician assignment changing to dispatched",
      replacement_window: "approximately seconds 0.8 to 5.5",
      effect: "AUTHENTIC_UI_SCREEN_REPLACEMENT",
    },
    frame_contract: {
      opening: "dispatcher at dark-screen monitor with technician preparing nearby",
      progression: "one confirmation click and subtle nod connect digital assignment to human action",
      closing: "technician exits frame with equipment toward the field",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  field_arrival: {
    title: "Investor Film V3 — Technician Arrives at Customer Site",
    editorial_role: "1:40-2:35 complete field-service story",
    description:
      "A ten-second feature-film quality field-service shot outside a high-end tropical villa in Phuket. A clean professional service van has just stopped. A pest-control technician exits naturally with a compact equipment case, checks a smartphone for the address or job for one beat, closes the van door, and walks with purpose toward the villa entrance. The smartphone screen is deep charcoal and replacement-friendly but does not dominate the shot. Tropical daylight, real plants, believable driveway and architecture. The camera makes one restrained tracking move alongside the technician. No dramatic posing and no fake branding.",
    intent: {
      story_purpose:
        "Move the field-service story from dispatch into the real customer environment with a clear sense of arrival and purpose.",
      emotional_tone: "professional, trustworthy, modern, calm",
      story_state_change: "the dispatched job becomes an on-site service visit",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "high-end tropical Phuket villa exterior with realistic driveway, planting and service access",
      subject:
        "credible pest-control technician in clean unbranded professional workwear",
      action:
        "exit service van, check job on smartphone briefly, close van, carry equipment toward villa entrance",
      composition:
        "restrained side tracking shot with environment and technician equally credible; phone visible only briefly and stable",
      audio_policy:
        "natural tropical ambience, van door, footsteps and equipment movement; no dialogue and no generated narration",
    },
    screen_replacement: {
      avantiqo_workspace: "Field Service / Today's Job / Customer Site",
      screen_action:
        "brief real Avantiqo job card or appointment view during the phone check",
      replacement_window: "approximately seconds 1.5 to 3.8",
      effect: "AUTHENTIC_UI_SCREEN_REPLACEMENT",
    },
    frame_contract: {
      opening: "service van and villa establish location as technician steps out",
      progression: "brief job check confirms purpose, then technician closes van and moves forward",
      closing: "technician approaches property entrance with equipment in hand",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  field_service: {
    title: "Investor Film V3 — Real Work at the Customer Site",
    editorial_role: "1:40-2:35 complete field-service story",
    description:
      "A ten-second premium cinematic pest-control service shot at the exterior and covered terrace edge of a high-end tropical Phuket villa. The same type of professional technician performs a believable inspection and targeted preventive treatment along a discreet structural edge near landscaping. The work is calm, methodical and safe, with realistic professional equipment and no exaggerated chemical cloud or hazard imagery. The technician checks one likely entry point, applies a controlled treatment, then marks the area complete with a small physical gesture and moves to the next inspection point. No device screen is needed in this shot. The camera uses one slow low lateral move that makes the real work feel precise and valuable.",
    intent: {
      story_purpose:
        "Give the investor-film field-service story a tangible middle: Avantiqo is connected to real work, not just office screens.",
      emotional_tone: "precise, competent, trustworthy, grounded",
      story_state_change: "the assigned service becomes completed physical work at the customer site",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "high-end tropical villa exterior or covered terrace with realistic building edges and landscaping",
      subject:
        "professional pest-control technician using credible compact inspection and treatment equipment",
      action:
        "inspect one entry point, perform one controlled preventive treatment, acknowledge completion and move to the next point",
      composition:
        "slow low lateral cinema move with hands and equipment readable without macro distortion",
      screen_policy: "No software screen is required in this shot.",
      audio_policy:
        "natural exterior ambience, subtle equipment and foot movement; no dialogue and no generated narration",
      safety_visual_policy:
        "routine professional preventive service only; no dangerous exposure, no dramatic spraying, no people or animals near treatment activity",
    },
    frame_contract: {
      opening: "technician studies one credible treatment point at the villa edge",
      progression: "one deliberate inspection and controlled treatment action",
      closing: "technician completes that point and moves naturally toward the next task",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "catalog";
    const scene = url.searchParams.get("scene") || "avantiqo_reveal";

    if (action === "catalog") {
      return json({
        success: true,
        source: SOURCE,
        default_duration_seconds: COMMON_OUTPUT.duration_seconds,
        scenes: Object.entries(SCENES).map(([id, shot]) => ({
          id,
          title: shot.title,
          editorial_role: shot.editorial_role,
          duration_seconds: shot.output_spec.duration_seconds,
          screen_replacement: shot.screen_replacement || null,
        })),
      });
    }

    if (action === "start") {
      const shot = SCENES[scene];
      if (!shot) {
        return json({ success: false, error: "Unknown scene" }, 400);
      }

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "gemini",
        input: {
          ...shot,
          quantity: shot.output_spec.duration_seconds,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: `AVANTIQO_INVESTOR_FILM_V3_${scene.toUpperCase()}`,
          brand: "Avantiqo",
          source: SOURCE,
          editorial_role: shot.editorial_role,
          provider_priority: ["gemini", "google-veo", "runway"],
          screen_replacement: shot.screen_replacement || null,
        },
        category: "AI",
      });

      return json({
        success: true,
        scene,
        title: shot.title,
        duration_seconds: shot.output_spec.duration_seconds,
        pending: result?.pending ?? null,
        provider: result?.provider || null,
        model: result?.model || null,
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        pricing: result?.pricing || null,
        started_at: result?.started_at || null,
        output: result?.output || null,
      });
    }

    if (action === "poll") {
      const provider = url.searchParams.get("provider");
      const providerJobId = url.searchParams.get("provider_job_id");
      const usageId = url.searchParams.get("usage_id");
      const credentialId = url.searchParams.get("credential_id") || null;
      const startedAt = url.searchParams.get("started_at") || null;

      if (!provider || !providerJobId || !usageId) {
        return json({ success: false, error: "Missing poll parameters" }, 400);
      }

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_FILM_V3_POLL",
          brand: "Avantiqo",
          source: SOURCE,
        },
      });

      return json({ success: true, scene, result });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}
