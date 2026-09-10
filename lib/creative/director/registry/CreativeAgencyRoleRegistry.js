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
    id: "human_place_truth_director",
    mandate: "Own lived human observation, place specificity and editorial patience. Require real rituals, work habits, relationships, local pressures, weather/material consequences and sensory facts; reject decorative people, generic geography and long holds that do not evolve internally. Define exactly what the audience is allowed to observe before the cut is earned.",
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
    id: "technical_subject_supervisor",
    mandate: "Own research-grounded physical truth for real technical subjects when exact proprietary source geometry is unavailable. Verify class, configuration, defining systems, operating context and prohibited lookalikes from multiple evidence sources before the subject can enter previz or generation.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "product_capability_director",
    mandate: "Own how a product, service or technical capability becomes visible human or engineering proof. Require a causal chain from capability to human intent, physical action, visible response and felt advantage; reject decorative hero shots, unsupported feature claims and exposition that tells what the film has not shown.",
    applies_to: ["TEMPORAL", "STILL", "INTERACTIVE"],
  },
  {
    id: "action_motion_supervisor",
    mandate: "Own the physical choreography of moving vehicles, machinery, stunts, props and bodies. Define start/end state, trajectory, speed profile, screen direction, clearance, contact and safety constraints so action remains controllable, repeatable and physically believable across camera and VFX handoffs.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "second_unit_director",
    mandate: "Own specialist action, POV, inserts, plates and auxiliary-unit coverage that cannot be captured by the primary unit alone. Every second-unit shot must inherit the master unit's subject identity, geography, product behavior, screen direction, lighting/time state and editorial purpose so added spectacle expands the film without creating a different world.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "production_designer",
    mandate: "Own the physical world of the film: locations, sets, architecture, materials, props, wardrobe interaction, surface aging and environmental storytelling. Convert art direction into buildable, spatially coherent world rules that can survive shot-to-shot continuity and VFX extension.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "location_production_supervisor",
    mandate: "Prove that locations, access, geography, weather, light direction, permits, logistics and shoot feasibility support the planned images. Reject generic location substitutes when a named place or physically specific environment is part of the story truth.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "previsualization_supervisor",
    mandate: "Previsualize complex shots, camera paths, blocking, reveals, transitions, VFX handoffs and spatial continuity before expensive production. Reject impossible camera moves, hidden resets and effects that have no executable spatial solution.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "cg_asset_supervisor",
    mandate: "Own digital-subject fidelity: modeling, proportions, topology, materials, textures, rig readiness and exact defining features. Prevent generic substitutions or geometry drift when a digital hero asset must remain the same object across shots.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "simulation_physics_supervisor",
    mandate: "Own physically simulated behavior including vehicles, mechanisms, cloth, fluids, smoke, debris, weather and secondary motion. Define constraints, forces, contacts and failure conditions so spectacle never breaks mechanics or world physics.",
    applies_to: ["TEMPORAL"],
  },
  {
    id: "tracking_roto_supervisor",
    mandate: "Own camera/object tracking, matchmove, roto and plate alignment evidence required for invisible integration. Reject composites or replacements whose perspective, occlusion, edge behavior or motion cannot be bound to the photographed world.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "compositing_supervisor",
    mandate: "Own the final integration of live action, CG, matte, generated elements and source-locked brand assets. Enforce perspective, light, depth, grain, atmosphere, motion blur, contact, edge fidelity and shot-to-shot continuity so the result reads as one photographed world.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "color_di_supervisor",
    mandate: "Own scene-referred color continuity, exposure relationships, highlight rolloff, black detail, skin/product truth, look development, shot matching and final DI. A grade may shape emotion but must not hide weak imagery, crush evidence or break source truth.",
    applies_to: ["TEMPORAL", "STILL"],
  },
  {
    id: "sound_design_supervisor",
    mandate: "Build the authored sound world from physical source sound, designed effects, transitions, perspective, silence and narrative emphasis. Every sound event must have a spatial or editorial role; reject random whooshes, generic trailer impacts and continuous undifferentiated beds.",
    applies_to: ["TEMPORAL", "AUDIO", "INTERACTIVE"],
  },
  {
    id: "mix_finishing_engineer",
    mandate: "Own final dialogue, music, effects and ambience hierarchy; dynamics; spatial field; loudness; transient control; translation; and final mix integrity. Prove that the soundtrack directs attention and survives delivery instead of merely being present.",
    applies_to: ["TEMPORAL", "AUDIO"],
  },
  {
    id: "post_production_supervisor",
    mandate: "Own the handoff and dependency chain across editorial, VFX, color, sound, mastering and versions. Verify that every shot has the right source, approved state, version lineage and finishing evidence before it can enter the master.",
    applies_to: ["TEMPORAL"],
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

const MASTER_PLAN_ROLE_IDS = new Set([
  "executive_creative_director",
  "strategy_director",
  "brand_director",
  "copy_director",
  "story_director",
  "film_director",
  "talent_performance_director",
  "art_director",
  "director_of_photography",
  "asset_intelligence_director",
  "production_director",
  "editor",
  "sound_director",
  "motion_design_director",
  "vfx_director",
  "experience_director",
  "technical_architect",
  "quality_director",
  "rights_safety_director",
  "release_director",
  "performance_director",
]);

export const CREATIVE_MASTER_PLAN_ROLES = Object.freeze(
  CREATIVE_AGENCY_ROLES.filter((role) => MASTER_PLAN_ROLE_IDS.has(role.id)),
);

export function creativeAgencyDecisionSchema() {
  return Object.fromEntries(
    CREATIVE_MASTER_PLAN_ROLES.map((role) => [
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
  return CREATIVE_MASTER_PLAN_ROLES
    .map((role) => `- ${role.id}: ${role.mandate} Applies to ${role.applies_to.join(", ")}.`)
    .join("\n");
}
