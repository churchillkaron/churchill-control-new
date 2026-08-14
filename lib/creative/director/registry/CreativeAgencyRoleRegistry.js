export const CREATIVE_AGENCY_ROLES = Object.freeze([
  {
    id: "executive_creative_director",
    mandate: "Own the creative thesis, originality, emotional authority and final quality bar. Prove that the governing idea depends on this organization's evidence and fails the anti-transfer test when swapped to another organization.",
    applies_to: ["ALL"],
  },
  {
    id: "strategy_director",
    mandate: "Translate business truth, audience evidence, market context and channel role into a persuasive strategy. Identify the evidence-supported audience tension, contradiction, obstacle or belief that gives the work a reason to exist.",
    applies_to: ["ALL"],
  },
  {
    id: "brand_director",
    mandate: "Protect identity, tone, product truth, claims, continuity and brand-system integrity. Identify the exact source truths that make the work ownable and the elements that must not drift.",
    applies_to: ["ALL"],
  },
  {
    id: "copy_director",
    mandate: "Own headlines, scripts, dialogue, product language, calls to action, multilingual tone and every audience-facing word. Reject transferable category language and ensure claims are earned by observable evidence.",
    applies_to: ["ALL"],
  },
  {
    id: "story_director",
    mandate: "Create structure, escalation, surprise, pacing, dialogue, humour and earned resolution. Every major beat must change audience knowledge, emotion or action rather than function as filler coverage.",
    applies_to: ["TEMPORAL", "INTERACTIVE", "DOCUMENT"],
  },
  {
    id: "film_director",
    mandate: "Direct performance, blocking, scene purpose, visual storytelling and emotional progression. Reject decorative montage and ensure each scene and shot causes or reveals a meaningful state change.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "talent_performance_director",
    mandate: "Own casting characteristics, voice suitability, performance authenticity, micro-behaviour, crowd direction and talent continuity.",
    applies_to: ["TEMPORAL", "STILL", "AUDIO", "INTERACTIVE"],
  },
  {
    id: "art_director",
    mandate: "Direct production design, wardrobe, palette, typography, composition and campaign-system coherence. Translate abstract style adjectives into observable material, spatial, typographic and compositional decisions.",
    applies_to: ["ALL"],
  },
  {
    id: "director_of_photography",
    mandate: "Specify framing, lenses, movement, focus, exposure, lighting and shot continuity. Every camera and lighting choice must have a perceptual or story reason rather than generic cinematic polish.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "asset_intelligence_director",
    mandate: "Inspect, classify, score, assign, reject, derive or regenerate assets with explicit evidence. State exact continuity anchors and transformation limits for every source-bearing production decision.",
    applies_to: ["ALL"],
  },
  {
    id: "production_director",
    mandate: "Build the dependency graph, provider requirements, cost controls, scheduling and resumability rules. Every production step must have a necessary creative purpose and use only verified enabled capabilities.",
    applies_to: ["ALL"],
  },
  {
    id: "editor",
    mandate: "Design selection, pacing, transitions, variants, platform cuts and editorial continuity. Cuts and transitions must follow story, attention or sensory logic rather than default montage rhythm.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "sound_director",
    mandate: "Design source sound, voice, music, effects, silence, mix hierarchy and loudness intent. Define what leads audience attention in each beat and distinguish source sound, music, generated effects and deliberate silence by role.",
    applies_to: ["TEMPORAL", "AUDIO", "INTERACTIVE"],
  },
  {
    id: "motion_design_director",
    mandate: "Design verified titles, graphics, logos, supers, transitions and interface motion outside generated pixels. Motion must serve hierarchy, timing and meaning rather than decorative movement.",
    applies_to: ["TEMPORAL", "INTERACTIVE", "STILL"],
  },
  {
    id: "vfx_director",
    mandate: "Plan invisible cleanup, compositing, integration, continuity repair and physically credible effects. Prefer seamless credibility over spectacle unless spectacle is essential to the governing idea.",
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
    mandate: "Reject technical, perceptual, narrative, realism, accessibility, brand and channel failures and prescribe bounded repair. Define inspectable evidence that separates technically complete work from release-grade work.",
    applies_to: ["ALL"],
  },
  {
    id: "rights_safety_director",
    mandate: "Protect licensing, identity, consent, claims, privacy, policy and release evidence.",
    applies_to: ["ALL"],
  },
  {
    id: "release_director",
    mandate: "Own export or build profiles, approvals, authenticated delivery, publication and evidence. Release criteria must be explicit and verifiable rather than inferred from generation completion.",
    applies_to: ["ALL"],
  },
  {
    id: "performance_director",
    mandate: "Define measurement, learning signals and controlled iteration after release. Measurement must connect to the mission outcome rather than generic engagement metrics when stronger business signals exist.",
    applies_to: ["ALL"],
  },
]);

export function creativeAgencyDecisionSchema() {
  return Object.fromEntries(
    CREATIVE_AGENCY_ROLES.map((role) => [
      role.id,
      {
        mandate: role.mandate,
        applies_to: [...role.applies_to],
        status:
          "Required string. Exactly ACTIVE or NOT_REQUIRED. Return a decision record for this role on every master plan. ACTIVE is appropriate only when this discipline has a concrete job in the selected direction; NOT_REQUIRED is appropriate when the discipline is outside the selected workflow or has no material job after considering the actual mission.",
        decision:
          "Required concrete string of at least one complete decision. When ACTIVE, state what this discipline is deciding for this specific organization, mission and deliverable rather than restating the mandate. When NOT_REQUIRED, state the exact workflow or mission reason it is unnecessary. Generic statements such as maintain quality, support the brand, make it premium, follow best practices or not applicable are insufficient.",
        evidence:
          "Required JSON array. ACTIVE roles require one or more exact evidence references grounded in supplied context. Prefer identifiable references such as asset_id, named product, venue, offer, audience fact, mission requirement, brief fact, research observation or approved-history fact. Evidence must explain why the decision belongs to this organization and cannot be a generic category assumption. NOT_REQUIRED roles may use an empty array. Never return a scalar string and never invent evidence.",
        confidence:
          "Required number from 0 to 100 reflecting confidence in this specific evidence-backed role decision. Do not inflate confidence to satisfy a quality threshold.",
        risks:
          "Required JSON array of concrete unresolved role-specific risks. Each risk should identify what could visibly, audibly, strategically, legally or operationally fail. Empty is valid only when no material role-specific risk remains.",
        repair_instructions:
          "Required JSON array of bounded actionable repairs owned by this role. Repairs must say what should change while preserving verified source truth. Empty is valid only when no role-specific repair is required.",
      },
    ]),
  );
}

export function creativeAgencyRoleInstructions() {
  return CREATIVE_AGENCY_ROLES
    .map((role) => `- ${role.id}: ${role.mandate} Applies to ${role.applies_to.join(", ")}.`)
    .join("\n");
}
