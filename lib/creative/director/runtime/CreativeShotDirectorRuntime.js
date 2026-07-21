import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, Number(value || 0)),
  );
}

function resolveSceneCount(durationSeconds) {
  const duration = Number(durationSeconds || 30);

  if (duration <= 15) return 3;
  if (duration <= 30) return 5;
  if (duration <= 60) return 8;
  return 12;
}

function fallbackShot({
  sceneNumber,
  shotNumber,
  durationSeconds,
  objective,
  emotion,
}) {
  return {
    shot_number: shotNumber,
    title: `Scene ${sceneNumber} Shot ${shotNumber}`,
    purpose:
      shotNumber === 1
        ? "Establish the truthful human situation and visual geography."
        : "Deliver the emotional turn, product truth, or memorable reaction.",
    duration_seconds: durationSeconds,
    opening_frame:
      "Begin on a stable, believable composition with clear subject hierarchy.",
    closing_frame:
      "End on a clean editorial frame that motivates the next cut.",
    action_beats: [
      {
        at_seconds: 0,
        action: "Begin the approved action naturally.",
      },
      {
        at_seconds: Math.max(1, durationSeconds - 1),
        action: "Resolve the action with a readable human reaction.",
      },
    ],
    performance_direction:
      "Use restrained micro-expressions, natural breathing, stable eye lines, realistic hand contact and human timing.",
    camera: {
      framing: shotNumber === 1 ? "Wide or medium-wide" : "Close or medium close-up",
      movement: shotNumber === 1 ? "Controlled slow push or stable observation" : "Subtle motivated move",
      lens: shotNumber === 1 ? "35mm" : "65mm",
      angle: "Natural eye-level unless the story motivates another angle",
      focus: "Keep the narrative subject and product action legible",
    },
    lighting: {
      direction: "Motivated by practical sources in the real location",
      quality: "Naturalistic with controlled cinematic contrast",
      continuity: "Match direction, color temperature and exposure across adjacent shots",
    },
    dialogue: [],
    narration: {},
    music: {
      function: "Support the emotional arc without overpowering reality",
    },
    sound_effects: [
      "Location-specific room tone",
      "Believable contact and movement sounds",
    ],
    subtitles: [],
    reference_pack: {
      required_roles: [
        "identity_reference",
        "product_reference",
        "venue_reference",
        "brand_reference",
      ],
      preserve: [
        "Approved identity",
        "Exact product and logo",
        "Recognizable venue truth",
        "Brand colors and materials",
      ],
      may_change: [
        "Camera position",
        "Background extras",
        "Lighting treatment",
      ],
      never_change: [
        "Face identity",
        "Product label or proportions",
        "Logo spelling and geometry",
        "Core venue architecture",
      ],
    },
    continuity: {
      entering: `Continue the established ${emotion || "emotional"} state.`,
      leaving: `Advance toward ${objective || "the scene objective"}.`,
      locks: [
        "Wardrobe",
        "Props",
        "Product state",
        "Screen direction",
        "Light direction",
      ],
    },
    reality_rules: {
      human: [
        "Natural blinking and breathing",
        "Stable anatomy and fingers",
        "Correct eye focus and reaction timing",
      ],
      physical: [
        "Correct gravity and momentum",
        "Stable object persistence",
        "Consistent contact shadows and reflections",
      ],
      environment: [
        "Plausible background behavior",
        "No looping crowd motion",
        "Stable signage and architecture",
      ],
    },
    negative_constraints: [
      "No morphing or identity drift",
      "No broken anatomy",
      "No fake generated text",
      "No flicker or duplicated objects",
      "No unmotivated camera movement",
    ],
    quality_requirements: {
      identity_fidelity: 95,
      product_fidelity: 98,
      brand_fidelity: 98,
      physical_reality: 92,
      continuity: 95,
      emotional_readability: 90,
    },
  };
}

function fallbackPlan({
  objective,
  durationSeconds,
}) {
  const sceneCount = resolveSceneCount(durationSeconds);
  const sceneDuration = Number(durationSeconds || 30) / sceneCount;
  const scenes = [];

  for (let index = 0; index < sceneCount; index += 1) {
    const sceneNumber = index + 1;
    const firstDuration = Number((sceneDuration * 0.45).toFixed(1));
    const secondDuration = Number((sceneDuration - firstDuration).toFixed(1));

    scenes.push({
      scene_number: sceneNumber,
      title: `Scene ${sceneNumber}`,
      objective:
        index === 0
          ? "Create an immediate human hook."
          : index === sceneCount - 1
            ? "Deliver the memorable payoff and business action."
            : "Escalate the story through truthful behavior and visual detail.",
      emotion:
        index === 0
          ? "curiosity"
          : index === sceneCount - 1
            ? "satisfaction"
            : "engagement",
      duration_seconds: sceneDuration,
      location: {},
      actors: [],
      products: [],
      brand_rules: [],
      visual_style: {
        realism: "photorealistic commercial cinema",
        texture: "natural materials, skin and practical light",
      },
      camera_style: {
        language: "motivated, restrained and editorially varied",
      },
      audio_style: {
        language: "specific room tone, tactile Foley and purposeful music",
      },
      humor: {
        mechanism:
          index === Math.max(1, sceneCount - 2)
            ? "observational reversal"
            : "none",
        setup: "",
        expectation: "",
        reversal: "",
        reaction: "",
        payoff: "",
      },
      shots: [
        fallbackShot({
          sceneNumber,
          shotNumber: 1,
          durationSeconds: firstDuration,
          objective,
          emotion: "attention",
        }),
        fallbackShot({
          sceneNumber,
          shotNumber: 2,
          durationSeconds: secondDuration,
          objective,
          emotion: "progression",
        }),
      ],
    });
  }

  return {
    production_version: "world-class-shot-director-v1",
    title: "Original Commercial Film",
    logline:
      "A truthful human story that turns the business objective into a memorable visual and emotional payoff.",
    objective,
    audience_truth: "People respond to specific human truth, not generic advertising claims.",
    story_thesis: objective || "Make the business value emotionally and visually undeniable.",
    brand_promise: "The experience shown is believable, desirable and specific to the organization.",
    emotional_arc: [
      "curiosity",
      "recognition",
      "escalation",
      "delight",
      "satisfaction",
    ],
    humor_strategy: {
      enabled: true,
      principle: "Use observational human behavior and reaction timing, never random jokes.",
    },
    visual_motif: "A recurring truthful detail that gains meaning through the film.",
    sound_motif: "A tactile real-world sound that supports transitions and payoff.",
    concepts: [],
    selected_concept: {
      title: "Truth With A Turn",
      rationale: "Combines believable reality, brand specificity and a memorable human reversal.",
    },
    research_summary: "Use organization, market, audience, brand and asset evidence before production.",
    scenes,
    final_quality_standard: {
      minimum_shot_score: 90,
      minimum_final_film_score: 92,
      regenerate_failed_shot_only: true,
      require_non_ai_feel: true,
    },
  };
}

function normalizePlan(result, input) {
  const fallback = fallbackPlan(input);
  const source = result && typeof result === "object"
    ? result
    : {};
  const sourceScenes = normalizeArray(source.scenes);

  if (!sourceScenes.length) return fallback;

  const scenes = sourceScenes.map((scene, sceneIndex) => {
    const fallbackScene = fallback.scenes[
      Math.min(sceneIndex, fallback.scenes.length - 1)
    ];
    const sourceShots = normalizeArray(scene.shots);
    const shots = sourceShots.length
      ? sourceShots
      : fallbackScene.shots;

    return {
      ...fallbackScene,
      ...scene,
      scene_number: sceneIndex + 1,
      duration_seconds: clamp(
        scene.duration_seconds || fallbackScene.duration_seconds,
        2,
        Number(input.durationSeconds || 30),
      ),
      humor: {
        ...fallbackScene.humor,
        ...(scene.humor || {}),
      },
      shots: shots.map((shot, shotIndex) => ({
        ...fallbackShot({
          sceneNumber: sceneIndex + 1,
          shotNumber: shotIndex + 1,
          durationSeconds:
            Number(shot.duration_seconds || 3),
          objective: scene.objective,
          emotion: scene.emotion,
        }),
        ...shot,
        shot_number: shotIndex + 1,
        duration_seconds: clamp(
          shot.duration_seconds || 3,
          1,
          10,
        ),
        camera: {
          ...fallbackScene.shots[0].camera,
          ...(shot.camera || {}),
        },
        lighting: {
          ...fallbackScene.shots[0].lighting,
          ...(shot.lighting || {}),
        },
        reference_pack: {
          ...fallbackScene.shots[0].reference_pack,
          ...(shot.reference_pack || {}),
        },
        continuity: {
          ...fallbackScene.shots[0].continuity,
          ...(shot.continuity || {}),
        },
        reality_rules: {
          ...fallbackScene.shots[0].reality_rules,
          ...(shot.reality_rules || {}),
        },
        quality_requirements: {
          ...fallbackScene.shots[0].quality_requirements,
          ...(shot.quality_requirements || {}),
        },
      })),
    };
  });

  return {
    ...fallback,
    ...source,
    production_version: "world-class-shot-director-v1",
    scenes,
    final_quality_standard: {
      ...fallback.final_quality_standard,
      ...(source.final_quality_standard || {}),
    },
  };
}

export const CreativeShotDirectorRuntime = {
  async direct({
    organization_id,
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    brief = {},
    assets = [],
    requestedOutputs = [],
    durationSeconds = 30,
    platform = "multi-channel",
    budgetMode = "quality-first",
  } = {}) {
    const input = {
      organization_id,
      organization,
      brand,
      industry,
      objective,
      brief,
      assets: assets.slice(0, 30),
      requestedOutputs,
      duration_seconds: Number(durationSeconds || 30),
      platform,
      budget_mode: budgetMode,
    };

    const result = await reason({
      task: `
Act as the sole executive film director for an original world-class commercial production.
Transform the supplied business truth, brand, brief and assets into a complete production bible.
Do not create one campaign-level video prompt.
Create multiple scenes and multiple independently directed shots.
Each shot must be reference-grounded, physically believable, emotionally purposeful and suitable for master-still-first image-to-video production.
Use humor only through specific human observation, setup, expectation, reversal, reaction and payoff.
Specify camera, lens, movement, lighting, performance, action timing, continuity, reference preservation, physical reality, sound, transitions, negative constraints and measurable quality requirements.
Return strict JSON only.
`,
      input,
      constraints: {
        original_work_only: true,
        no_living_artist_style_imitation: true,
        no_generic_cinematic_language: true,
        no_campaign_level_video_request: true,
        master_still_before_video: true,
        preserve_reference_truth: true,
        generator_is_worker_only: true,
      },
      outputShape: {
        result: {
          title: "string",
          logline: "string",
          audience_truth: "string",
          story_thesis: "string",
          brand_promise: "string",
          emotional_arc: ["string"],
          humor_strategy: {
            enabled: "boolean",
            principle: "string",
          },
          visual_motif: "string",
          sound_motif: "string",
          concepts: [
            {
              title: "string",
              angle: "string",
              originality_score: "number",
              brand_fit_score: "number",
              emotional_force_score: "number",
              production_feasibility_score: "number",
              humor_potential_score: "number",
              ai_risk_score: "number",
            },
          ],
          selected_concept: {
            title: "string",
            rationale: "string",
          },
          research_summary: "string",
          scenes: [
            {
              scene_number: "number",
              title: "string",
              objective: "string",
              emotion: "string",
              duration_seconds: "number",
              location: "object",
              actors: ["object"],
              products: ["object"],
              brand_rules: ["string"],
              visual_style: "object",
              camera_style: "object",
              audio_style: "object",
              humor: {
                mechanism: "string",
                setup: "string",
                expectation: "string",
                reversal: "string",
                reaction: "string",
                payoff: "string",
              },
              shots: [
                {
                  shot_number: "number",
                  title: "string",
                  purpose: "string",
                  duration_seconds: "number",
                  opening_frame: "string",
                  closing_frame: "string",
                  action_beats: ["object"],
                  performance_direction: "string",
                  camera: "object",
                  lighting: "object",
                  actors: ["object"],
                  products: ["object"],
                  dialogue: ["object"],
                  narration: "object",
                  music: "object",
                  sound_effects: ["string"],
                  subtitles: ["object"],
                  reference_asset_ids: ["string"],
                  reference_pack: "object",
                  continuity: "object",
                  reality_rules: "object",
                  negative_constraints: ["string"],
                  quality_requirements: "object",
                  transition_in: "object",
                  transition_out: "object",
                },
              ],
            },
          ],
          final_quality_standard: "object",
        },
      },
      temperature: 0.85,
    });

    return normalizePlan(
      result?.result,
      {
        objective,
        durationSeconds: Number(durationSeconds || 30),
      },
    );
  },
};
