export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

const COMMON_OUTPUT = {
  duration_seconds: 5,
  aspect_ratio: "16:9",
};

const COMMON_REQUIREMENTS = {
  visual_quality:
    "world-class photoreal premium enterprise technology commercial with feature-film production value",
  realism:
    "natural human movement, realistic anatomy, believable physics, real-world wardrobe and props, premium practical lighting",
  camera_language:
    "controlled motivated cinema camera movement, restrained depth of field, stable geometry, sophisticated feature-film polish",
  screen_policy:
    "EVERY visible phone, tablet, laptop or monitor must use a deep charcoal to near-black screen with subtle low-contrast dark placeholder panels only. Absolutely no white interface, no bright browser page, no readable fake text, no invented logo, no colorful generic dashboard. Keep the screen stable, large, clean and perspective-friendly for later replacement with the real dark Avantiqo interface from the source screen recording.",
  continuity_policy:
    "The physical screen must remain geometrically stable throughout the shot with minimal occlusion so real Avantiqo UI can be composited precisely in post.",
  negative_constraints: [
    "no white device screens",
    "no bright generic dashboards",
    "no invented software UI",
    "no logos",
    "no readable generated UI text",
    "no sci-fi holograms",
    "no glowing interface overlays",
    "no synthetic skin",
    "no warped hands",
    "no distorted screens",
    "no cheesy corporate acting",
    "no exaggerated advertising gestures",
    "no generic AI-video beauty look",
  ],
};

const SCENES = {
  field: {
    title: "Avantiqo field service — pest-control technician",
    description:
      "A premium cinematic commercial shot in Phuket, Thailand, late-morning tropical light. A professional pest-control field technician in clean modern workwear stands outside a high-end tropical villa after completing a service visit. The technician uses a modern smartphone at chest height to review and confirm the completed job, taps once, then looks toward the property with calm operator confidence. The phone display itself must be dark charcoal, never white, and remain front-facing enough for exact replacement with the real Avantiqo Field Service interface.",
    intent: {
      story_purpose:
        "Show Avantiqo connecting a real field-service worker to the operating system at the exact moment work is completed and verified.",
      emotional_tone: "competent, trustworthy, modern, calm, premium",
      story_state_change:
        "service visit moves from physical completion to digitally confirmed operational proof",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "high-end tropical Phuket villa exterior with believable professional pest-control service context",
      subject:
        "professional pest-control field technician, credible service-company workwear, no visible brand marks",
      action:
        "review completed job on smartphone, one deliberate tap, then look toward property",
      composition:
        "over-the-shoulder three-quarter view with phone prominent, screen stable and nearly rectangular to camera",
      lighting:
        "late-morning natural tropical light, refined highlights, realistic skin tones",
    },
    screen_replacement: {
      avantiqo_workspace: "Field Service Operations / Appointment Window / Job Completion",
      narration_cue:
        "Operations gives teams a clear command center for daily execution.",
      screen_action:
        "show active job, service checklist, completion state, one confirmation interaction",
      replacement_window: "approximately seconds 0.8 to 4.0 of the five-second shot",
    },
    frame_contract: {
      opening: "technician stationary outside villa, dark-screen smartphone already visible",
      progression: "subtle camera push-in while technician reviews and taps once",
      closing: "technician lowers attention from phone and looks confidently toward property",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  restaurant: {
    title: "Avantiqo hospitality — restaurant waiter order confirmation",
    description:
      "A premium cinematic commercial shot inside an elegant modern restaurant during active evening service. A professional waiter in a smart dark uniform stands beside a table and uses a compact tablet to confirm an order. Guests dine naturally in soft focus while another staff member moves through the background. The waiter makes one deliberate tap and immediately continues service. The tablet display itself must be deep charcoal to near-black, never white, with no readable fake text, and remain large and stable for exact replacement with the real Avantiqo restaurant POS and table interface.",
    intent: {
      story_purpose:
        "Show Avantiqo embedded naturally inside live hospitality service rather than presented as a separate software demo.",
      emotional_tone: "warm, sophisticated, human, fast, controlled",
      story_state_change:
        "guest order moves from human interaction into governed operational execution",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "upmarket contemporary restaurant during genuine evening service",
      subject: "professional waiter in elegant dark service uniform",
      action: "confirm order on tablet with one tap, then continue serving naturally",
      composition:
        "over-the-shoulder three-quarter angle; tablet screen clearly visible, stable and nearly rectangular to camera",
      lighting:
        "warm practical restaurant lighting with cinematic contrast and realistic ambient movement",
    },
    screen_replacement: {
      avantiqo_workspace: "Restaurant Operations / Table View / POS Order",
      narration_cue:
        "Here, restaurant operations are one example. Orders, service workflows and operational control live inside the same platform architecture.",
      screen_action:
        "show live table, order items and one send-or-confirm action matching the waiter tap",
      replacement_window: "approximately seconds 0.6 to 3.8",
    },
    frame_contract: {
      opening: "waiter engaged with table, dark-screen tablet held steadily within frame",
      progression: "one clean confirmation tap as guests remain naturally active in background",
      closing: "waiter turns smoothly back into service flow",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  manager: {
    title: "Avantiqo operator — multi-business manager command view",
    description:
      "A premium cinematic enterprise technology shot. A hands-on restaurant or multi-business general manager sits in a refined practical office overlooking an active operation through glass, reviewing performance on a laptop. The camera begins over the manager's shoulder with the laptop display large, stable and nearly rectangular to camera, then performs a subtle slow push-in. The laptop itself must show a deep charcoal to near-black interface surface with only subtle dark placeholder blocks, never a white browser or fake generic dashboard. The manager makes one deliberate trackpad action, absorbs the information, then looks through the glass toward the business floor. The display must remain ideal for exact compositing of the real Avantiqo workspace synchronized to narration.",
    intent: {
      story_purpose:
        "Show the operator seeing finance and operations as one connected business context.",
      emotional_tone:
        "intelligent, composed, authoritative, operator-driven rather than corporate",
      story_state_change:
        "manager moves from reviewing digital operating intelligence to observing the real business it represents",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment:
        "quiet modern operator office overlooking a live hospitality or multi-business operation",
      subject:
        "credible hands-on general manager, sophisticated but not boardroom-styled",
      action:
        "review laptop, one deliberate trackpad action, then look through glass toward operation",
      composition:
        "over-the-shoulder framing with laptop screen large, stable and nearly rectangular; restrained slow push-in",
      lighting:
        "warm practical office light mixed with subtle cool monitor illumination, screen itself dark",
    },
    screen_replacement: {
      avantiqo_workspace: "Operations Command Center first, then Finance / Analytics depending edit cue",
      narration_cue:
        "Instead of finance living in one system, operations in another... Avantiqo connects the core business domains so information, decisions and execution can work together.",
      screen_action:
        "start on Operations command view; during trackpad action cut or animate to Finance or Analytics while preserving real Avantiqo dark UI",
      replacement_window: "approximately seconds 0.4 to 4.5",
    },
    frame_contract: {
      opening:
        "manager seated with dark-screen laptop clearly visible and live operation beyond glass",
      progression: "slow push-in during one deliberate trackpad action",
      closing: "manager looks away from laptop toward the live business floor",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  hotel: {
    title: "Avantiqo hotel operations — front desk and live service control",
    description:
      "A world-class cinematic hotel operations shot inside a sophisticated five-star tropical hotel lobby. A polished front-office manager stands slightly behind the reception desk while a receptionist assists arriving guests naturally. The manager checks a slim tablet showing a deep charcoal near-black screen, makes one deliberate tap, then looks toward the lobby as a bell attendant moves through frame. No staged smiles or corporate posing. The tablet remains large, stable and suitable for replacement with the real Avantiqo Operations workspace.",
    intent: {
      story_purpose:
        "Expand the platform story from restaurant service into broader hospitality operations.",
      emotional_tone: "premium, calm, global, operationally precise",
      story_state_change:
        "live guest-service activity is connected to a central operational view",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "five-star tropical hotel lobby with active but controlled guest movement",
      subject: "credible front-office manager and working reception team",
      action: "manager checks tablet, taps once, then scans live lobby operation",
      composition:
        "elegant lateral dolly or slow push, tablet visible in three-quarter profile without warping",
      lighting: "luxury natural daylight mixed with warm practical hotel lighting",
    },
    screen_replacement: {
      avantiqo_workspace: "Operations / Hospitality Command Center",
      narration_cue:
        "Operations gives teams a clear command center for daily execution. Industry workspaces can then add the capabilities each company actually needs.",
      screen_action: "show live operational status and hospitality tasks",
      replacement_window: "approximately seconds 1.0 to 4.0",
    },
    frame_contract: {
      opening: "active hotel lobby with manager already holding dark-screen tablet",
      progression: "one tap while camera moves subtly and guest service continues",
      closing: "manager looks into lobby, visually connecting screen intelligence to real operation",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  kitchen: {
    title: "Avantiqo restaurant production — professional kitchen execution",
    description:
      "A cinematic professional restaurant kitchen during a controlled dinner rush. A chef at the pass checks a mounted kitchen display or compact dark-screen tablet while another chef plates a dish under warm pass lights. Steam, stainless steel and real movement create texture. The chef glances at the screen, calls the next plate with a subtle hand cue, then the finished dish moves through the pass. The device display must remain deep charcoal to near-black and stable for later replacement with the real Avantiqo kitchen or production workflow.",
    intent: {
      story_purpose:
        "Make restaurant operations feel end-to-end: order becomes kitchen execution, not merely a POS click.",
      emotional_tone: "precise, energetic, premium, disciplined",
      story_state_change: "digital order state becomes physical kitchen production",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "high-end open professional kitchen during authentic service",
      subject: "experienced chef and kitchen team working naturally",
      action: "check kitchen display, signal next plate, completed dish leaves pass",
      composition:
        "low controlled lateral move with screen and plated food both readable in composition",
      lighting: "warm pass lights, realistic stainless reflections, cinematic contrast",
    },
    screen_replacement: {
      avantiqo_workspace: "Restaurant Operations / Kitchen / Order Status",
      narration_cue:
        "Orders, service workflows and operational control live inside the same platform architecture.",
      screen_action: "show active order moving from sent to ready",
      replacement_window: "approximately seconds 0.5 to 3.5",
    },
    frame_contract: {
      opening: "chef and dark kitchen display both established",
      progression: "chef checks screen and signals completion",
      closing: "finished plate exits the pass toward service",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  bar: {
    title: "Avantiqo bar operations — live order to finished drink",
    description:
      "A premium cinematic bar shot in a sophisticated hospitality venue at night. A bartender works naturally under elegant practical lighting, glances at a small dark-screen order display near the bar station, then completes a refined cocktail and slides it to service. The screen must be deep charcoal to near-black with no readable fake text and remain geometrically stable for replacement with the real Avantiqo bar or restaurant order view. Keep the performance restrained and believable, not flashy flair bartending.",
    intent: {
      story_purpose: "Show the same operating context reaching bar execution in real time.",
      emotional_tone: "confident, premium, human, fast",
      story_state_change: "digital service demand becomes a finished guest-facing product",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "high-end restaurant or hotel bar during active evening service",
      subject: "professional bartender, elegant practical workwear",
      action: "check order display, finish cocktail, move drink into service",
      composition: "controlled slider movement with dark order screen and bartender both visible",
      lighting: "warm amber practical lights with restrained cool accents",
    },
    screen_replacement: {
      avantiqo_workspace: "Restaurant Operations / Bar Orders",
      narration_cue: "orders, service workflows and operational control",
      screen_action: "show one active bar order advancing to ready",
      replacement_window: "approximately seconds 0.6 to 2.8",
    },
    frame_contract: {
      opening: "bartender working with dark order screen in frame",
      progression: "quick glance to screen then final drink preparation",
      closing: "finished cocktail moves toward waiter/service pickup",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  hospital: {
    title: "Avantiqo cross-industry operations — healthcare coordination",
    description:
      "A sophisticated cinematic healthcare operations shot inside a modern hospital administrative or nursing coordination station. No medical procedure and no patient distress. A professional operations coordinator or senior nurse reviews staffing or operational status on a slim tablet with a deep charcoal near-black screen while colleagues move naturally through a bright, calm clinical environment. The coordinator makes one deliberate tap and then turns to coordinate with a colleague. The tablet must remain clean and stable for later replacement with a real Avantiqo operations or people workspace. This scene represents cross-industry platform applicability, not a claim of an existing hospital customer.",
    intent: {
      story_purpose:
        "Demonstrate that the operating-context architecture can extend beyond hospitality and field service into complex multi-team environments.",
      emotional_tone: "calm, serious, capable, trustworthy",
      story_state_change: "shared operational information becomes coordinated human action",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "modern hospital operations or nursing coordination station, clean and believable",
      subject: "professional healthcare operations coordinator or senior nurse",
      action: "review tablet, tap once, coordinate with colleague",
      composition: "subtle push-in with tablet visible but environment still clearly healthcare",
      lighting: "clean natural daylight, restrained cinematic contrast, no sterile overexposure",
    },
    screen_replacement: {
      avantiqo_workspace: "Operations / People / Scheduling context",
      narration_cue:
        "The platform is multi-company and cross-industry by design... one intelligent operating layer instead of a growing collection of disconnected software.",
      screen_action: "show staffing or operational coordination view",
      replacement_window: "approximately seconds 0.8 to 3.8",
    },
    frame_contract: {
      opening: "healthcare coordination station with dark tablet established",
      progression: "one deliberate screen interaction",
      closing: "coordinator turns from digital context to colleague and real-world action",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  warehouse: {
    title: "Avantiqo supply chain — receiving and warehouse control",
    description:
      "A premium cinematic warehouse receiving shot. A procurement or warehouse supervisor stands beside a clean receiving bay as cartons or hospitality supplies arrive on a trolley or pallet. The supervisor scans or checks a tablet with a deep charcoal near-black screen, compares the delivery, makes one confirmation tap, then signals that the goods can move inward. The screen stays stable and front-facing enough for the real Avantiqo Procurement, Goods Receipt or Inventory interface to be composited in post.",
    intent: {
      story_purpose:
        "Show procurement and receiving as a physical workflow connected directly to the operating system.",
      emotional_tone: "controlled, industrial, precise, modern",
      story_state_change: "delivery becomes verified receiving data and controlled inventory movement",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "modern organized receiving bay or warehouse serving an operating business",
      subject: "credible warehouse or procurement supervisor",
      action: "check arriving goods, one tablet confirmation, signal movement onward",
      composition: "three-quarter over-shoulder framing with goods and dark tablet visible",
      lighting: "natural industrial daylight with cinematic contrast",
    },
    screen_replacement: {
      avantiqo_workspace: "Procurement / Goods Receipt / Inventory",
      narration_cue:
        "Procurement brings purchasing, supplier activity, receiving and control into the same environment.",
      screen_action: "show purchase order receipt and confirm received quantity",
      replacement_window: "approximately seconds 0.7 to 3.7",
    },
    frame_contract: {
      opening: "delivery arrives and dark tablet is already visible",
      progression: "supervisor compares and confirms receipt",
      closing: "goods move inward after digital confirmation",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  finance: {
    title: "Avantiqo finance — controller with real operating context",
    description:
      "A world-class cinematic finance shot in a modern but practical business office. A finance controller reviews a large desktop monitor or laptop with a deep charcoal near-black screen. Physical documents and a second colleague suggest real month-end work without clutter. The controller makes one controlled mouse or trackpad action and then studies the result. The display stays large, stable, minimally reflective and nearly rectangular to camera so the real Avantiqo Finance interface can be composited precisely. Never show a white spreadsheet or generic fake finance dashboard.",
    intent: {
      story_purpose:
        "Connect the investor narration about journals, reporting and governance to a believable finance professional using the actual product.",
      emotional_tone: "serious, trustworthy, intelligent, enterprise-grade",
      story_state_change: "operating activity becomes governed financial control and insight",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "modern finance office connected visually to an operating company",
      subject: "credible finance controller or senior accountant",
      action: "review dark monitor, one deliberate action, study resulting financial view",
      composition: "over-the-shoulder with display large and nearly rectangular to camera",
      lighting: "restrained premium office lighting with subtle cool screen ambience",
    },
    screen_replacement: {
      avantiqo_workspace: "Finance / General Ledger / Journals / Reporting",
      narration_cue:
        "Finance adds journals, accounting workflows, reporting and governance. Because these areas share organization context, financial control can follow operational activity.",
      screen_action: "show journal or reporting view tied to operating data",
      replacement_window: "approximately seconds 0.4 to 4.4",
    },
    frame_contract: {
      opening: "finance controller and dark display clearly established",
      progression: "one precise screen interaction while camera gently pushes in",
      closing: "controller holds on the financial result with calm confidence",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  people: {
    title: "Avantiqo people — workforce and attendance in real operations",
    description:
      "A cinematic workforce operations shot at the beginning of a hospitality shift. Two team members arrive through a staff entrance while a supervisor reviews a compact tablet with a deep charcoal near-black screen. One employee checks in or confirms attendance naturally; the supervisor makes one quick tablet interaction and the team moves toward the operation. No biometric sci-fi effects. The tablet remains stable for replacement with the real Avantiqo People, Roster or Attendance interface.",
    intent: {
      story_purpose:
        "Show people, attendance and operational responsibility connected to the same company context.",
      emotional_tone: "human, organized, responsible, energetic",
      story_state_change: "staff arrival becomes live workforce readiness inside the operating system",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "premium hotel or restaurant staff entrance before service",
      subject: "realistic hospitality supervisor and diverse professional team members",
      action: "staff arrive, attendance is checked, team moves into operation",
      composition: "gentle tracking shot with dark tablet visible in supervisor hands",
      lighting: "early-shift practical light, warm and authentic",
    },
    screen_replacement: {
      avantiqo_workspace: "People / Roster / Attendance / Payroll context",
      narration_cue:
        "People, projects and administration are connected too. Teams can work across roles, responsibilities, projects, policies and access controls without losing the business context around the work.",
      screen_action: "show roster and attendance status",
      replacement_window: "approximately seconds 0.8 to 3.6",
    },
    frame_contract: {
      opening: "staff entering with supervisor and dark tablet established",
      progression: "attendance confirmation occurs naturally",
      closing: "team moves toward live service together",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: { aspect_ratio: "16:9" },
  },

  compliance: {
    title: "Avantiqo compliance — inspection and obligation control",
    description:
      "A premium cinematic business compliance shot in a professional operating environment such as a hotel plant room, commercial kitchen back-of-house or facilities corridor. A manager and specialist inspect a safety or equipment item while the manager checks a tablet with a deep charcoal near-black screen. One checklist item is acknowledged, then they continue the inspection. Avoid danger, alarm or emergency imagery. The screen remains stable for replacement with the real Avantiqo Compliance and Assets interface.",
    intent: {
      story_purpose:
        "Show governance extending beyond finance into real obligations, inspections and business asset control.",
      emotional_tone: "responsible, controlled, professional, preventive",
      story_state_change: "physical inspection becomes accountable digital evidence and follow-up",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "credible facilities or back-of-house inspection environment",
      subject: "operations manager and specialist performing a routine inspection",
      action: "inspect item, acknowledge checklist on tablet, continue inspection",
      composition: "measured tracking or push-in with tablet and inspected asset both visible",
      lighting: "realistic practical facility lighting with cinematic shaping",
    },
    screen_replacement: {
      avantiqo_workspace: "Compliance & Assets / Obligations / Inspections",
      narration_cue:
        "People, projects and administration are connected too... policies and access controls without losing the business context around the work.",
      screen_action: "show inspection checklist or obligation status",
      replacement_window: "approximately seconds 0.8 to 3.8",
    },
    frame_contract: {
      opening: "inspection context established with dark tablet visible",
      progression: "one checklist interaction during physical inspection",
      closing: "manager and specialist move to next inspection point",
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

    const action = url.searchParams.get("action") || "start";
    const scene = url.searchParams.get("scene") || "field";

    if (action === "catalog") {
      return json({
        success: true,
        scenes: Object.entries(SCENES).map(([id, shot]) => ({
          id,
          title: shot.title,
          screen_replacement: shot.screen_replacement,
        })),
      });
    }

    if (action === "start") {
      const shot = SCENES[scene];
      if (!shot) return json({ success: false, error: "Unknown scene" }, 400);

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "gemini",
        input: {
          ...shot,
          quantity: COMMON_OUTPUT.duration_seconds,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: `AVANTIQO_PRODUCTION_FILM_${scene.toUpperCase()}`,
          brand: "Avantiqo",
          source: "avantiqo_production_film_live_shots_20260818_v2",
          provider_priority: ["gemini", "google-veo", "runway"],
          screen_replacement: shot.screen_replacement,
        },
        category: "AI",
      });

      return json({
        success: true,
        scene,
        screen_replacement: shot.screen_replacement,
        pending: result.pending,
        provider: result.provider,
        model: result.model,
        provider_job_id: result.provider_job_id || null,
        provider_status: result.provider_status || null,
        usage_id: result.usage?.id || null,
        credential_id: result.credential_id || null,
        pricing: result.pricing || null,
        started_at: result.started_at || null,
        output: result.output || null,
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
          operation: "AVANTIQO_PRODUCTION_FILM_LIVE_SHOT_POLL",
          brand: "Avantiqo",
          source: "avantiqo_production_film_live_shots_20260818_v2",
        },
      });

      return json({ success: true, result });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
