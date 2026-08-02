import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  assertTemporalSemanticPlan,
  validateTemporalSemanticPlan,
} from "@/lib/creative/director/validation/CreativeTemporalSemanticPlanValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-plan-gate.v3",
);
const REPAIR_CONTRACT = "CREATIVE_TEMPORAL_SEMANTIC_REPAIR_V2";
const EXPECTED_SHOT_COUNTS = Object.freeze([2, 2, 3, 3, 3]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function corpus(plan = {}) {
  return JSON.stringify({
    concept: plan.concept,
    story: plan.story,
    scenes: plan.scenes,
    asset_manifest: plan.asset_manifest,
  }).toLowerCase();
}

function boundedHospitalityArc(plan = {}) {
  const source = corpus(plan);
  return Boolean(
    /\b(?:entrance|threshold|arriv|enter)\w*\b/.test(source) &&
    /\b(?:food|dish|dining|drink|cocktail|service|order)\w*\b/.test(source) &&
    /\b(?:game|pool|shuffleboard|dart|play)\w*\b/.test(source) &&
    /\b(?:band|live music|perform|stage|sing|dance)\w*\b/.test(source) &&
    /\b(?:logo|brand mark|invitation|visit|join)\w*\b/.test(source)
  );
}

function duration(scene = {}) {
  return Number(scene.duration_seconds || 0);
}

function repairShot(shot = {}, patch = {}, scene = {}) {
  const generation = {
    ...object(shot.generation),
    ...object(patch.generation),
  };
  const repaired = {
    ...shot,
    ...patch,
    id: shot.id,
    duration_seconds: shot.duration_seconds,
  };
  const providerPrompt = [
    `STORY FUNCTION: ${text(repaired.purpose)}.`,
    `VISIBLE SUBJECT: ${text(repaired.subject)}.`,
    `VISIBLE ACTION: ${text(repaired.action)}.`,
    `PERFORMANCE: ${text(repaired.performance)}.`,
    `SCENE OBJECTIVE: ${text(scene.objective)}.`,
    text(generation.provider_prompt),
    "Do not repeat any earlier arrival, entrance, threshold or discovery beat unless this is one of the two opening-threshold shots. Preserve exact supplied identities, venue evidence, products and brand assets. No synthetic text, logo, watermark or poster inside generated pixels.",
  ].filter(Boolean).join("\n\n");

  repaired.generation = {
    ...generation,
    provider_prompt: generation.required === false
      ? text(generation.provider_prompt) || null
      : providerPrompt,
  };
  return repaired;
}

function phaseDefinitions(plan = {}, scenes = []) {
  return [
    {
      title: "The Threshold",
      objective:
        "Establish one clear transition from the ordinary outside world into the distinctive interior experience; complete the arrival beat here and nowhere else.",
      story_state_before:
        "The audience is outside the experience and has not yet discovered what makes the place distinctive.",
      state_change:
        "A single guest crosses the threshold and the environment changes from ordinary exterior calm to an inviting interior world.",
      story_state_after:
        "The guest and audience are fully inside; all later scenes advance through hospitality, participation, performance and belonging.",
      transition_logic:
        "Once inside, the story proves the promise through attentive service, food and drinks.",
      shotPatches: [
        {
          title: "Exterior Decision",
          purpose:
            "Introduce the ordinary evening and the guest making the single decision to enter.",
          subject: "A guest approaching the verified exterior and exact entrance",
          action:
            "The guest notices the real entrance, commits to the visit and reaches the doorway in one continuous decision.",
          performance:
            "Natural curiosity becomes a quiet, decisive forward movement; no exaggerated reaction or staged posing.",
        },
        {
          title: "Crossing Into the Interior World",
          purpose:
            "Complete the only threshold crossing and reveal the immediate warmth and human welcome inside.",
          subject: "The same guest crossing from the verified entrance into the interior",
          action:
            "The door opens, the guest crosses once, and the visual environment changes into the established interior geography.",
          performance:
            "The guest relaxes subtly on entry while staff acknowledgement establishes welcome without stopping the motion.",
        },
      ],
    },
    {
      title: "Proof Through Service and Taste",
      objective:
        "Prove the venue promise through real service, food and drinks while moving the guest from observer to participant.",
      story_state_before:
        "The guest is present in the interior but has not yet experienced the venue's hospitality or products.",
      state_change:
        "Attentive service and authentic food and drinks create the first tangible reward of the evening.",
      story_state_after:
        "The guest is seated, served and emotionally open to the social experience around them.",
      transition_logic:
        "Satisfied attention shifts naturally from the table toward shared activity and friendly participation.",
      shotPatches: [
        {
          title: "Attentive Welcome and Order",
          purpose:
            "Show genuine welcome and ordering through natural staff interaction, establishing hospitality as the first proof point.",
          subject: "The guest, service team and verified interior service point",
          action:
            "Staff greet the guest, clarify the order and begin preparing drinks while nearby tables establish lived-in social context.",
          performance:
            "Eye contact, listening, small smiles and efficient gestures communicate genuine service without theatrical posing.",
        },
        {
          title: "Food and Drinks Arrive",
          purpose:
            "Deliver observable product proof through verified dishes and drinks and show the guest's first genuine enjoyment.",
          subject: "Verified food, drinks, the guest and attentive service",
          action:
            "Plates and drinks arrive, the guest tastes and responds naturally, and the camera reveals texture, freshness and social warmth.",
          performance:
            "A restrained first taste becomes a real smile and a relaxed exchange with nearby guests.",
        },
      ],
    },
    {
      title: "Participation Becomes Connection",
      objective:
        "Move from individual enjoyment into friendly participation through games and shared social behaviour.",
      story_state_before:
        "The guest is comfortable but still socially separate from the wider room.",
      state_change:
        "A spontaneous invitation into play turns observation into participation and creates new human connection.",
      story_state_after:
        "The guest belongs to a small group and the room's energy has visibly increased.",
      transition_logic:
        "The connected group is ready for the larger collective release created by live performance.",
      shotPatches: [
        {
          title: "Invitation to Play",
          purpose:
            "Create the social turn by having another guest invite the newcomer into a verified game.",
          subject: "The newcomer, another guest and a verified game area",
          action:
            "A natural gesture offers participation; the newcomer accepts and joins the game, shifting from observer to participant.",
          performance:
            "Brief uncertainty resolves into an easy laugh and confident participation.",
        },
        {
          title: "Friendly Rivalry",
          purpose:
            "Show real game mechanics, concentration and friendly competition building shared energy.",
          subject: "Guests actively playing a verified game with correct physical interaction",
          action:
            "A complete playable action occurs, the result is visible, and the group responds to the outcome together.",
          performance:
            "Focused anticipation breaks into authentic teasing, surprise and laughter.",
        },
        {
          title: "The Group Expands",
          purpose:
            "Connect games, tables and conversation into one coherent social room before the live-performance peak.",
          subject: "The growing guest group across the verified interior",
          action:
            "Drinks are shared, conversation crosses between tables and participants turn toward the performance area as music begins.",
          performance:
            "Attention shifts collectively; separate conversations align around the first musical cue.",
        },
      ],
    },
    {
      title: "One Shared Night",
      objective:
        "Deliver the emotional peak through live music transforming separate groups into one connected crowd.",
      story_state_before:
        "Several groups are connected locally but the room has not yet become one shared experience.",
      state_change:
        "The live band and rising rhythm synchronize guests, staff and space into a collective celebration.",
      story_state_after:
        "The newcomer is fully part of the room and the venue's promise has been emotionally proven.",
      transition_logic:
        "After the peak, the film resolves calmly with belonging, a final human exchange and an earned invitation.",
      shotPatches: [
        {
          title: "Live Performance Ignites the Room",
          purpose:
            "Introduce the verified live performance as the cause of the room's final energy rise.",
          subject: "The live band, the newcomer and connected guest groups",
          action:
            "The band begins the decisive musical section; heads turn, bodies respond and lighting movement follows the rhythm.",
          performance:
            "Musicians perform with grounded physical timing while guests react in varied, believable ways.",
        },
        {
          title: "Separate Groups Become One Crowd",
          purpose:
            "Show the concept's emotional turn as previously separate guests synchronize through music.",
          subject: "Guests, staff and performers sharing one coherent interior geography",
          action:
            "Clapping, singing along, dancing and exchanged looks spread through the room in a clear causal progression.",
          performance:
            "Joy builds from individual reactions into collective release without generic anonymous party montage.",
        },
        {
          title: "The Newcomer Belongs",
          purpose:
            "Complete the human story by showing the original guest fully included in the shared celebration.",
          subject: "The original guest inside the connected crowd with the live band visible",
          action:
            "The guest joins the rhythm, exchanges recognition with the people met earlier and shares the peak as part of the group.",
          performance:
            "The final emotional change is visible in relaxed confidence, eye contact and unforced participation.",
        },
      ],
    },
    {
      title: "The Invitation",
      objective:
        "Resolve the night with human warmth, preserve the emotional afterglow and deliver an exact deterministic brand invitation outside generated pixels.",
      story_state_before:
        "The collective celebration has proven the experience at full energy.",
      state_change:
        "The film settles into belonging and converts the earned feeling into a clear invitation to experience it personally.",
      story_state_after:
        "The audience understands the promise, remembers the exact brand and knows the next action.",
      transition_logic:
        "The story ends on the exact approved brand mark and invitation, with no generated typography or logo.",
      shotPatches: [
        {
          title: "Afterglow Among New Friends",
          purpose:
            "Let the emotional peak settle into a warm proof of new connection and shared memory.",
          subject: "The original guest and the people met during the night",
          action:
            "The group shares a final laugh and quiet toast as the live music continues in the background.",
          performance:
            "Energy softens into genuine familiarity and satisfied calm.",
        },
        {
          title: "A Last Look Across the Room",
          purpose:
            "Close the human journey with the guest recognising the night as an experience worth returning to.",
          subject: "The original guest, connected group and verified interior atmosphere",
          action:
            "The guest looks across the room, exchanges one final acknowledgement and holds the shared experience in a restrained moment of recognition.",
          performance:
            "A restrained smile communicates belonging and future return without direct-to-camera advertising performance.",
        },
        {
          title: "Exact Brand End Card",
          purpose:
            "Deliver the earned invitation with the exact approved brand mark and deterministic typography outside generated provider pixels.",
          subject: "The exact approved brand mark and final invitation",
          action:
            "The picture resolves to a deterministic end card composited locally over the final seconds.",
          performance:
            "No generated human performance; hold the exact brand composition cleanly and confidently.",
          generation: {
            ...object(list(scenes[4].shots)[2]?.generation),
            required: false,
          },
          graphics: {
            ...object(list(scenes[4].shots)[2]?.graphics),
            logo: {
              ...object(list(scenes[4].shots)[2]?.graphics?.logo),
              required: true,
              exact_asset_required: true,
              role: "PRIMARY_BRAND_MARK",
            },
            titles: [
              {
                role: "INVITATION",
                text:
                  text(plan.concept?.call_to_action) ||
                  text(plan.story?.call_to_action) ||
                  "Experience the night for yourself.",
              },
            ],
            background: "#080808",
            render_text_outside_generated_pixels: true,
          },
        },
      ],
    },
  ];
}

function repairHospitalityArc(plan = {}, validation = {}) {
  const scenes = list(plan.scenes);
  if (
    scenes.length !== EXPECTED_SHOT_COUNTS.length ||
    scenes.some((scene, index) =>
      list(scene.shots).length !== EXPECTED_SHOT_COUNTS[index])
  ) {
    return null;
  }

  const definitions = phaseDefinitions(plan, scenes);
  const repairedScenes = scenes.map((scene, sceneIndex) => {
    const definition = definitions[sceneIndex];
    const shots = list(scene.shots).map((shot, shotIndex) =>
      repairShot(
        shot,
        definition.shotPatches[shotIndex],
        definition,
      ),
    );
    return {
      ...scene,
      ...definition,
      id: scene.id,
      duration_seconds: duration(scene),
      shots,
      metadata: {
        ...object(scene.metadata),
        temporal_semantic_repair: {
          contract: REPAIR_CONTRACT,
          source_failure_codes: [
            ...new Set(validation.failures.map((item) => item.code)),
          ],
          bounded_pattern: "HOSPITALITY_THRESHOLD_TO_SHARED_NIGHT",
          provider_execution_required: false,
          customer_charge_required: false,
          visible_arrival_shot_count: 2,
          post_threshold_arrival_language_prohibited: true,
        },
      },
    };
  });

  return {
    ...plan,
    scenes: repairedScenes,
    production: {
      ...object(plan.production),
      deterministic_brand_compositing_required: true,
      temporal_semantic_repair_contract: REPAIR_CONTRACT,
      temporal_semantic_repair_provider_execution: false,
      temporal_semantic_repair_customer_charge: false,
    },
  };
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutSemanticGate =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithTemporalSemanticGate(input = {}) {
      const result = await createWithoutSemanticGate(input);
      let plan = object(result?.plan);
      const workflow = text(plan.workflow_kind).toUpperCase();

      if (workflow !== "TEMPORAL") return result;

      let semanticValidation = validateTemporalSemanticPlan(plan);
      let repaired = false;
      if (!semanticValidation.passed && boundedHospitalityArc(plan)) {
        const candidate = repairHospitalityArc(plan, semanticValidation);
        if (candidate) {
          plan = candidate;
          semanticValidation = validateTemporalSemanticPlan(plan);
          repaired = true;
        }
      }

      assertTemporalSemanticPlan(plan);

      const repairEvidence = repaired
        ? {
            contract: REPAIR_CONTRACT,
            applied: true,
            provider_execution_required: false,
            customer_charge_required: false,
          }
        : null;

      return {
        ...result,
        plan: {
          ...plan,
          validation: {
            ...object(plan.validation),
            passed: true,
            temporal_semantic_validation: semanticValidation,
            temporal_semantic_repair: repairEvidence,
          },
        },
        validation: {
          ...object(result.validation),
          passed: true,
          temporal_semantic_validation: semanticValidation,
          temporal_semantic_repair: repairEvidence,
        },
      };
    };
}

install();

export const CreativeTemporalSemanticPlanGateRuntime = {
  installed: true,
};
