import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.evidence-narrative-craft.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

const SCENE_ARC = [
  {
    title: "The First Signal",
    purpose:
      "Begin with visual authority and a clear sense of place. The opening chapter should create curiosity before the film reveals the range of experiences held inside Churchill.",
    state_change:
      "The viewer moves from first recognition to active curiosity.",
  },
  {
    title: "Inside the Atmosphere",
    purpose:
      "Move from recognition into mood. This chapter should make the venue feel layered, intimate, and alive through composition, pace, and authentic source texture rather than invented activity.",
    state_change:
      "Curiosity becomes emotional interest in the venue's atmosphere.",
  },
  {
    title: "Craft and Detail",
    purpose:
      "Slow the rhythm long enough for quality to register. Use selective detail, material contrast, and controlled focus so the viewer feels care, finish, and substance.",
    state_change:
      "Atmosphere gains credibility through tangible detail and craft.",
  },
  {
    title: "The Competitive Edge",
    purpose:
      "Introduce a sharper pulse and a sense of playful precision. Geometry, timing, and directional movement should add energy without fabricating participants or events.",
    state_change:
      "The film shifts from appreciation into active momentum.",
  },
  {
    title: "The Social Current",
    purpose:
      "Broaden the emotional register with warmth and human-scale observation. The edit should suggest connection through authentic visible material, not through invented interactions.",
    state_change:
      "Momentum becomes an inviting sense of shared experience.",
  },
  {
    title: "The Night Builds",
    purpose:
      "Raise the tempo toward the film's peak. Contrast, rhythm, and source-led motion should make Churchill feel like a complete evening with multiple moods in one destination.",
    state_change:
      "The venue's individual qualities combine into one confident night-time proposition.",
  },
  {
    title: "The Churchill Signature",
    purpose:
      "Resolve the film with clarity and recall. The final chapter should compress the preceding moods into a confident Churchill signature and leave a clean visual memory.",
    state_change:
      "The experience resolves into a memorable Churchill identity.",
  },
];

const SHOT_CRAFT = [
  {
    title: "Red-Carpet Signal",
    purpose:
      "Establish confidence through symmetry and depth, giving the first image enough space to register before the edit begins to accelerate.",
    shot_size: "architectural wide",
    lens: "24mm",
    movement_path: "slow axial rise",
    movement_motivation:
      "Lift the viewer's attention through the composition so the opening feels ceremonial rather than static.",
    direction:
      "Open with a disciplined architectural wide and protect the strongest vertical lines. Hold the 24mm perspective long enough for scale to read, then execute a slow axial rise that gathers visual confidence without changing the physical scene. Finish on a clean geometric relationship that can cut precisely into the next beat.",
    opening: "Begin on the broadest stable composition with depth clearly readable.",
    progression: "Allow scale to register, then elevate attention along the composition's strongest axis.",
    closing: "Land on a precise geometric detail that creates a confident visual handoff.",
  },
  {
    title: "A Glimpse Beyond",
    purpose:
      "Turn initial recognition into invitation by changing the viewer's angle of attention and revealing a second layer within the same authentic composition.",
    shot_size: "medium wide",
    lens: "35mm",
    movement_path: "diagonal parallax drift",
    movement_motivation:
      "Create discovery through changing overlap and negative space while every visible element remains fixed to the source.",
    direction:
      "Enter from an offset medium-wide composition rather than repeating the opening symmetry. Use a 35mm diagonal parallax drift to separate foreground and background planes, letting negative space uncover a secondary point of interest. The move should feel like a private glimpse, ending before the composition becomes fully explained.",
    opening: "Start from an offset angle with foreground and background planes overlapping.",
    progression: "Slide diagonally until the secondary visual layer becomes legible through parallax.",
    closing: "Stop on an incomplete reveal that preserves curiosity for the following chapter.",
  },
  {
    title: "Ambient Current",
    purpose:
      "Translate the venue's visual atmosphere into motion by tracing light, texture, and spatial rhythm across the verified material.",
    shot_size: "environmental medium wide",
    lens: "32mm",
    movement_path: "shallow crescent arc",
    movement_motivation:
      "Use a curved path to make the environment feel dimensional and enveloping without implying an unsupported event.",
    direction:
      "Build the frame around tonal contrast and environmental texture. Travel on a shallow crescent arc with a 32mm lens so edges shift at different speeds and the setting acquires dimension. Keep the pace fluid, avoid a central hero composition, and resolve on the richest transition between light and shadow.",
    opening: "Open where tonal contrast divides the frame into distinct visual zones.",
    progression: "Arc gently across the setting so texture and depth replace literal action as the source of motion.",
    closing: "Resolve on the most expressive boundary between illumination and shadow.",
  },
  {
    title: "Human Scale",
    purpose:
      "Bring the film closer and make the experience feel personal through proportion, selective focus, and observed detail already visible in the source.",
    shot_size: "observational medium",
    lens: "50mm",
    movement_path: "restrained shoulder-level glide",
    movement_motivation:
      "Lower the film to a natural human viewpoint and create intimacy through proximity rather than fabricated performance.",
    direction:
      "Shift to a natural shoulder-level viewpoint with a 50mm lens and shallower depth. Glide laterally at a restrained pace, allowing one authentic visible detail to briefly take precedence before focus settles elsewhere in the same source state. Keep the framing observational, calm, and free of staged emphasis.",
    opening: "Begin at a natural eye line with one authentic detail near the focal plane.",
    progression: "Glide laterally while focus transfers once between two existing visual details.",
    closing: "Settle on the quieter detail to create intimacy before the next cut.",
  },
  {
    title: "Craft in Focus",
    purpose:
      "Make quality tangible by isolating finish, surface, and precision within the verified source rather than relying on broad descriptive coverage.",
    shot_size: "close detail",
    lens: "85mm",
    movement_path: "compressed micro push",
    movement_motivation:
      "Use optical compression and a minimal advance to make craftsmanship feel deliberate and premium.",
    direction:
      "Compress the visual field with an 85mm close-detail frame. Begin with a narrow band of sharpness, then perform a minimal micro push that increases presence without becoming an obvious zoom. Let surface, edge quality, and material finish carry the shot, ending at the exact point where the detail feels most tactile.",
    opening: "Open with a narrow focal plane resting on a high-quality surface or edge.",
    progression: "Advance minimally so texture and finish gain presence through optical compression.",
    closing: "Stop when the selected detail reaches maximum tactile clarity.",
  },
  {
    title: "Colour Under Glass",
    purpose:
      "Create a sensory pause through colour separation, reflection, and controlled stillness, giving the edit a luxurious breath before momentum returns.",
    shot_size: "macro impression",
    lens: "100mm macro",
    movement_path: "locked composition with focus bloom",
    movement_motivation:
      "Hold spatial position and create movement only through a slow expansion of the focal plane.",
    direction:
      "Treat this beat as an abstract sensory study. Lock the 100mm macro composition and let a slow focus bloom travel across colour, reflection, or fine texture already present. Avoid lateral movement entirely; the tension should come from changing clarity. End with the frame at its most graphic and saturated.",
    opening: "Start with a deliberately narrow zone of clarity and soft surrounding colour.",
    progression: "Expand the focal plane gradually while the camera position remains locked.",
    closing: "Finish on the strongest graphic arrangement of colour and reflection.",
  },
  {
    title: "Lines of Play",
    purpose:
      "Inject precision and pace through directional geometry, transforming authentic shapes and spatial relationships into a clean editorial rhythm.",
    shot_size: "high three-quarter wide",
    lens: "28mm",
    movement_path: "linear cross-frame slide",
    movement_motivation:
      "Follow the composition's dominant line to create momentum from geometry instead of invented action.",
    direction:
      "Choose a high three-quarter angle that exposes the strongest directional geometry. With a 28mm lens, slide cleanly across the frame on one unwavering axis so parallel lines and changing proportions generate pace. The motion should be crisp and exact, concluding where the geometry forms its most balanced graphic pattern.",
    opening: "Begin where the dominant directional line enters the composition.",
    progression: "Track across one axis and let changing proportions create the beat's momentum.",
    closing: "Stop at the most balanced arrangement of lines, edges, and negative space.",
  },
  {
    title: "Precision Point",
    purpose:
      "Concentrate the playful energy into one exact visual target, using timing and perspective to make a small source detail feel decisive.",
    shot_size: "low medium detail",
    lens: "40mm",
    movement_path: "low rail convergence",
    movement_motivation:
      "Align the move with converging lines so the viewer's attention arrives at one precise endpoint.",
    direction:
      "Drop the camera to a lower medium-detail perspective and align a 40mm lens with converging lines in the source. Travel forward on a short rail path, allowing the vanishing point to tighten the frame naturally. Do not simulate impact or activity; make the endpoint feel decisive through composition and timing alone.",
    opening: "Open low, with converging lines establishing a clear visual route.",
    progression: "Advance along the route as the vanishing point tightens attention.",
    closing: "Arrive at one exact source detail and cut at the moment of maximum alignment.",
  },
  {
    title: "Warmth in the Frame",
    purpose:
      "Shift from precision into emotional warmth by observing authentic visible character with a softer, more intimate camera language.",
    shot_size: "medium close observation",
    lens: "58mm",
    movement_path: "gentle partial orbit",
    movement_motivation:
      "Soften the edit through a curved observational move that reveals dimensionality without staging interaction.",
    direction:
      "Move into a medium-close observational frame with a 58mm lens. Describe a gentle partial orbit around the existing focal area, keeping the curve small enough to feel intimate rather than theatrical. Prioritize warmth, natural contrast, and human-scale detail, then finish on a quiet expression of character already contained in the source.",
    opening: "Begin close enough for warmth and character to dominate over architecture.",
    progression: "Orbit gently through a limited angle, preserving the source's authentic relationships.",
    closing: "Resolve on the most emotionally warm existing detail in the composition.",
  },
  {
    title: "After-Dark Pulse",
    purpose:
      "Raise the film's heartbeat by combining broader scale, bolder contrast, and a controlled change of pace without adding physical content.",
    shot_size: "kinetic wide",
    lens: "24mm",
    movement_path: "measured push-pull pulse",
    movement_motivation:
      "Use a reversible depth move to create rhythmic acceleration while the underlying source remains truthful.",
    direction:
      "Return to a wider 24mm field but abandon the opening's ceremonial stillness. Execute one measured push followed by a shorter release, creating a visual pulse through depth and scale. Let contrast and existing source motion supply energy; keep the move controlled enough that the venue still feels premium rather than frenetic.",
    opening: "Start wide with depth layers clearly separated and visual energy contained.",
    progression: "Push into the depth structure, then release slightly to create one controlled pulse.",
    closing: "Hold the recovered wide frame for a fraction before the next acceleration.",
  },
  {
    title: "The Energy Crest",
    purpose:
      "Bring the film to its editorial peak by combining scale, motion, and visual density into the strongest truthful source-led moment.",
    shot_size: "elevated full composition",
    lens: "35mm",
    movement_path: "descending diagonal sweep",
    movement_motivation:
      "Move from overview toward detail so the sequence feels like it is gathering its separate moods into one climax.",
    direction:
      "Begin from an elevated full composition with a 35mm lens and a clear view of multiple depth planes. Descend on a diagonal sweep, allowing the frame to become denser and more immediate as it travels. Use existing movement and contrast as the crescendo; finish at the instant the composition feels most complete and energetic.",
    opening: "Open with an elevated overview that holds several depth planes at once.",
    progression: "Descend diagonally as the composition gains density and immediacy.",
    closing: "Cut at the peak arrangement of scale, contrast, and authentic source motion.",
  },
  {
    title: "One Last Look",
    purpose:
      "Release the peak with a graceful visual exhale, giving the viewer one final textured impression before the branded resolution.",
    shot_size: "intimate medium wide",
    lens: "45mm",
    movement_path: "slow backward reveal",
    movement_motivation:
      "Create emotional release by expanding the frame and restoring breathing room after the preceding climax.",
    direction:
      "Begin closer than expected with a 45mm lens, holding a textured existing detail near the centre of attention. Retreat slowly and evenly, allowing surrounding context to return without turning the move into another establishing view. The frame should feel like a final look over the shoulder, ending with enough calm space for the signature cut.",
    opening: "Start close on a textured source detail with limited surrounding context.",
    progression: "Withdraw slowly as context returns and the visual rhythm relaxes.",
    closing: "Finish in a calm, balanced composition designed to hand off to the final signature.",
  },
  {
    title: "Churchill, Remembered",
    purpose:
      "Convert the full film into brand recall by ending on a calm, unmistakable Churchill signature with no competing visual movement.",
    shot_size: "centred signature close",
    lens: "70mm",
    movement_path: "locked hold with controlled settle",
    movement_motivation:
      "Remove editorial motion at the finish so recognition, confidence, and memory become the final beat.",
    direction:
      "Centre the authenticated Churchill signature already present in the bound source and simplify the surrounding composition. Use a 70mm perspective with a locked hold, allowing only a controlled optical settle during the first moment. Preserve exact lettering, proportions, and visible colour relationships; finish with a clean uninterrupted hold long enough for recall.",
    opening: "Enter on the Churchill signature already visible in the verified source.",
    progression: "Allow a brief optical settle, then remove all further movement.",
    closing: "Hold the authentic Churchill signature cleanly through the final frame.",
  },
];

function isEligible(plan = {}) {
  const evidence = object(plan.metadata?.evidence_constrained_direction);
  const sourceGate = object(plan.validation?.source_shot_evidence);
  return Boolean(
    evidence.contract === "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1" &&
    sourceGate.contract === "CREATIVE_SOURCE_SHOT_EVIDENCE_V3" &&
    text(sourceGate.readiness).toUpperCase() === "PASS" &&
    Number(sourceGate.shot_count) > 0 &&
    Number(sourceGate.passed_shot_count) === Number(sourceGate.shot_count) &&
    Number(sourceGate.failed_shot_count) === 0
  );
}

function craftShot(shot, craft, sceneIndex, globalShotIndex) {
  const camera = {
    ...object(shot.camera),
    shot_size: craft.shot_size,
    framing: craft.shot_size,
    lens: craft.lens,
    movement_path: craft.movement_path,
    movement: craft.movement_path,
    movement_motivation: craft.movement_motivation,
  };
  const framePlan = {
    ...object(shot.frame_plan),
    opening_frame: craft.opening,
    progression: craft.progression,
    closing_frame: craft.closing,
  };
  const openingFrame = {
    ...object(shot.opening_frame),
    description: craft.opening,
  };
  const closingFrame = {
    ...object(shot.closing_frame),
    description: craft.closing,
  };

  return {
    ...object(shot),
    title: craft.title,
    purpose: craft.purpose,
    intent: craft.purpose,
    story_function: craft.purpose,
    narrative_function: craft.purpose,
    description: craft.direction,
    direction: craft.direction,
    visual_direction: craft.direction,
    opening_frame: openingFrame,
    closing_frame: closingFrame,
    frame_plan: framePlan,
    camera,
    generation: {
      ...object(shot.generation),
      description: craft.direction,
      prompt: undefined,
      instruction: undefined,
      instructions: undefined,
      visual_prompt: undefined,
      video_prompt: undefined,
    },
    metadata: {
      ...object(shot.metadata),
      narrative_craft_contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V1",
      narrative_chapter_index: sceneIndex,
      editorial_beat_index: globalShotIndex,
      physical_content_invention_allowed: false,
    },
  };
}

export function craftEvidenceConstrainedNarrative(plan = {}) {
  if (!isEligible(plan)) {
    return {
      plan,
      evidence: {
        contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V1",
        applied: false,
        reason: "EVIDENCE_CONSTRAINED_SOURCE_SHOT_GATE_REQUIRED",
      },
    };
  }

  let globalShotIndex = 0;
  const scenes = list(plan.scenes).map((scene, sceneIndex) => {
    const sceneCraft = SCENE_ARC[sceneIndex] || {
      title: `Chapter ${sceneIndex + 1}`,
      purpose: `Give chapter ${sceneIndex + 1} a differentiated editorial function while preserving all verified source constraints.`,
      state_change: "The viewer gains a new perspective on the same truthful source world.",
    };
    const shots = list(scene.shots).map((shot) => {
      const craft = SHOT_CRAFT[globalShotIndex] || SHOT_CRAFT[
        globalShotIndex % SHOT_CRAFT.length
      ];
      const crafted = craftShot(shot, craft, sceneIndex, globalShotIndex);
      globalShotIndex += 1;
      return crafted;
    });

    return {
      ...object(scene),
      title: sceneCraft.title,
      purpose: sceneCraft.purpose,
      intent: sceneCraft.purpose,
      objective: sceneCraft.purpose,
      story_function: sceneCraft.purpose,
      narrative_function: sceneCraft.purpose,
      summary: sceneCraft.purpose,
      description: sceneCraft.purpose,
      state_change: sceneCraft.state_change,
      shots,
    };
  });

  const craftedPlan = {
    ...object(plan),
    concept: {
      ...object(plan.concept),
      title: "One Place. Seven Moods.",
      statement:
        "A sixty-second Churchill portrait that moves from first signal to final signature, revealing atmosphere, craft, play, warmth, and after-dark energy through authentic source-led cinema.",
      campaign_line: "Churchill — the night has more than one mood.",
      evidence_policy: "SOURCE_EVIDENCE_ONLY",
    },
    strategy: {
      ...object(plan.strategy),
      creative_principle:
        "Build desire through contrast: scale against intimacy, stillness against pulse, precision against warmth, and discovery against recognition.",
      narrative_arc:
        "Recognition → atmosphere → craft → momentum → warmth → crescendo → signature.",
      source_evidence_required: true,
      physical_content_invention_allowed: false,
    },
    scenes,
    metadata: {
      ...object(plan.metadata),
      evidence_narrative_craft: {
        contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V1",
        scene_count: scenes.length,
        shot_count: globalShotIndex,
        distinct_scene_arc_count: Math.min(scenes.length, SCENE_ARC.length),
        distinct_shot_craft_count: Math.min(globalShotIndex, SHOT_CRAFT.length),
        source_bindings_changed: false,
        timing_changed: false,
        physical_content_invention_allowed: false,
      },
    },
  };

  return {
    plan: craftedPlan,
    evidence: {
      contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V1",
      applied: true,
      scene_count: scenes.length,
      shot_count: globalShotIndex,
      distinct_scene_arc_count: Math.min(scenes.length, SCENE_ARC.length),
      distinct_shot_craft_count: Math.min(globalShotIndex, SHOT_CRAFT.length),
      source_bindings_changed: false,
      timing_changed: false,
      provider_calls_executed: false,
      physical_content_invention_allowed: false,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutNarrativeCraft =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithEvidenceNarrativeCraft(input = {}) {
      const result = await createWithoutNarrativeCraft(input);
      if (!result?.plan) return result;
      const crafted = craftEvidenceConstrainedNarrative(result.plan);
      console.log(
        `CREATIVE_EVIDENCE_NARRATIVE_CRAFT=${JSON.stringify(crafted.evidence)}`,
      );
      return {
        ...result,
        plan: crafted.plan,
        evidence_narrative_craft: crafted.evidence,
      };
    };
}

install();

export const CreativeEvidenceNarrativeCraftRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V1",
  craft: craftEvidenceConstrainedNarrative,
});
