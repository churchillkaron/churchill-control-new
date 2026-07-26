export const CREATIVE_AGENCY_ROLES = Object.freeze([
  {
    id: "executive_creative_director",
    mandate: "Own the creative thesis, originality, emotional authority and final quality bar.",
    applies_to: ["ALL"],
  },
  {
    id: "strategy_director",
    mandate: "Translate business truth, audience evidence, market context and channel role into a persuasive strategy.",
    applies_to: ["ALL"],
  },
  {
    id: "brand_director",
    mandate: "Protect identity, tone, product truth, claims, continuity and brand-system integrity.",
    applies_to: ["ALL"],
  },
  {
    id: "story_director",
    mandate: "Create structure, escalation, surprise, pacing, dialogue, humour and earned resolution.",
    applies_to: ["TEMPORAL", "INTERACTIVE", "DOCUMENT"],
  },
  {
    id: "film_director",
    mandate: "Direct performance, blocking, scene purpose, visual storytelling and emotional progression.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "art_director",
    mandate: "Direct production design, wardrobe, palette, typography, composition and campaign-system coherence.",
    applies_to: ["ALL"],
  },
  {
    id: "director_of_photography",
    mandate: "Specify framing, lenses, movement, focus, exposure, lighting and shot continuity.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "asset_intelligence_director",
    mandate: "Inspect, classify, score, assign, reject, derive or regenerate assets with explicit evidence.",
    applies_to: ["ALL"],
  },
  {
    id: "production_director",
    mandate: "Build the dependency graph, provider requirements, cost controls, scheduling and resumability rules.",
    applies_to: ["ALL"],
  },
  {
    id: "editor",
    mandate: "Design selection, pacing, transitions, variants, platform cuts and editorial continuity.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "sound_director",
    mandate: "Design source sound, voice, music, effects, silence, mix hierarchy and loudness intent.",
    applies_to: ["TEMPORAL", "AUDIO", "INTERACTIVE"],
  },
  {
    id: "motion_design_director",
    mandate: "Design verified titles, graphics, logos, supers, transitions and interface motion outside generated pixels.",
    applies_to: ["TEMPORAL", "INTERACTIVE", "STILL"],
  },
  {
    id: "vfx_director",
    mandate: "Plan invisible cleanup, compositing, integration, continuity repair and physically credible effects.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "experience_director",
    mandate: "Own information architecture, interaction, responsive behaviour, accessibility and conversion journeys.",
    applies_to: ["INTERACTIVE"],
  },
  {
    id: "technical_architect",
    mandate: "Define application architecture, components, data contracts, security, testing and deployment evidence.",
    applies_to: ["INTERACTIVE", "SOFTWARE"],
  },
  {
    id: "quality_director",
    mandate: "Reject technical, perceptual, narrative, realism, accessibility, brand and channel failures and prescribe bounded repair.",
    applies_to: ["ALL"],
  },
  {
    id: "rights_safety_director",
    mandate: "Protect licensing, identity, consent, claims, privacy, policy and release evidence.",
    applies_to: ["ALL"],
  },
  {
    id: "release_director",
    mandate: "Own export or build profiles, approvals, authenticated delivery, publication and evidence.",
    applies_to: ["ALL"],
  },
  {
    id: "performance_director",
    mandate: "Define measurement, learning signals and controlled iteration after release.",
    applies_to: ["ALL"],
  },
]);

export function creativeAgencyDecisionSchema() {
  return Object.fromEntries(
    CREATIVE_AGENCY_ROLES.map((role) => [
      role.id,
      {
        status: "ACTIVE|NOT_REQUIRED",
        decision: "",
        evidence: [],
        confidence: 0,
        risks: [],
        repair_instructions: [],
      },
    ]),
  );
}

export function creativeAgencyRoleInstructions() {
  return CREATIVE_AGENCY_ROLES
    .map((role) => `- ${role.id}: ${role.mandate} Applies to ${role.applies_to.join(", ")}.`)
    .join("\n");
}
