function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function requiredStoryBeats(brief = {}) {
  const specifications = brief.specifications || {};
  const candidates = [
    brief.required_story_beats,
    brief.scene_plan,
    brief.structure,
    specifications.required_story_beats,
    specifications.scene_plan,
    specifications.structure,
  ];

  return candidates
    .find((value) => Array.isArray(value))
    ?.map((value) => String(value || "").trim())
    .filter(Boolean) || [];
}

function beatTitle(value = "") {
  return String(value)
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*s(?:ec(?:ond)?s?)?\s*\)\s*$/i, "")
    .trim();
}

function beatDuration(value = "", fallback = 4) {
  const match = String(value).match(/\(\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\s*\)/i);
  return Math.max(2, Math.round(Number(match?.[1] || fallback)));
}

function terms(value = "") {
  const stop = new Set([
    "the", "and", "with", "from", "into", "scene", "shot", "seconds",
    "second", "film", "video", "master", "cinematic", "churchill",
  ]);

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !stop.has(term));
}

function sceneText(scene = {}) {
  return JSON.stringify({
    title: scene.title,
    objective: scene.objective,
    emotion: scene.emotion,
    location: scene.location,
    actors: scene.actors,
    products: scene.products,
    shots: scene.shots,
  }).toLowerCase();
}

function scoreSceneForBeat(scene, beat) {
  const text = sceneText(scene);
  return terms(beat).reduce(
    (score, term) => score + (text.includes(term) ? 1 : 0),
    0,
  );
}

function profileForBeat(value = "") {
  const text = String(value).toLowerCase();

  if (/exterior|arrival|facade|outside/.test(text)) {
    return {
      emotion: "anticipation",
      objective: "Establish the real venue at night and make arrival feel immediate, premium, and unmistakably specific.",
      first: {
        title: "Exterior Arrival — Venue Geography",
        purpose: "Reveal the authentic exterior, signage, approach path, and first human arrival beat.",
        opening_frame: "Begin on a stable wide view of the real night exterior with recognizable architecture and signage.",
        closing_frame: "End as the arriving subject reaches the threshold and the interior energy becomes visible.",
        framing: "Wide establishing frame",
        movement: "Controlled push toward the entrance",
        lens: "28mm",
      },
      second: {
        title: "Exterior Arrival — Sign & Threshold Detail",
        purpose: "Land the brand identity and human anticipation through a tactile entrance detail.",
        opening_frame: "Cut to the authentic sign, door hardware, reflected light, and the subject's approach.",
        closing_frame: "Resolve on the door opening into the venue atmosphere.",
        framing: "Medium detail and close-up",
        movement: "Subtle lateral reveal",
        lens: "65mm",
      },
    };
  }

  if (/entrance|walk.?through|door|threshold/.test(text)) {
    return {
      emotion: "discovery",
      objective: "Carry the audience through the real entrance and reveal the venue progressively rather than in one generic wide shot.",
      first: {
        title: "Entrance Walk-through — Motivated Follow",
        purpose: "Follow the subject through the threshold with clear geography, realistic pace, and motivated camera movement.",
        opening_frame: "Start behind or beside the arriving subject as the real entrance opens.",
        closing_frame: "End when the first major interior layer is revealed.",
        framing: "Medium-wide follow",
        movement: "Smooth motivated tracking move",
        lens: "35mm",
      },
      second: {
        title: "Entrance Walk-through — Interior Reveal",
        purpose: "Use a reaction and environmental detail to turn entry into emotional discovery.",
        opening_frame: "Cut to a guest reaction, practical light, material detail, or staff welcome that proves the real atmosphere.",
        closing_frame: "Resolve toward the bar or performance area and motivate the next scene.",
        framing: "Medium close-up with environment",
        movement: "Slow arc or restrained push",
        lens: "50mm",
      },
    };
  }

  if (/bartender|flair|fire|flame/.test(text)) {
    return {
      emotion: "surprise",
      objective: "Stage controlled bartender flair as a precise performance beat with credible fire behavior, safe distance, and premium craft detail.",
      first: {
        title: "Bartender Flair — Controlled Performance",
        purpose: "Show the bartender's full controlled action, body mechanics, tool contact, and flame geography.",
        opening_frame: "Begin on the bartender prepared at the real bar with tools, glassware, and flame source clearly positioned.",
        closing_frame: "End at the peak of the controlled flare with stable hands, face, bottle, and bar geometry.",
        framing: "Medium performance frame",
        movement: "Motivated slow push with no erratic orbit",
        lens: "40mm",
      },
      second: {
        title: "Bartender Flair — Flame & Reaction Detail",
        purpose: "Deliver the tactile flame detail, cocktail transformation, and believable guest reaction.",
        opening_frame: "Cut to the flame, liquid, glass rim, bartender focus, or guest reaction with exact continuity.",
        closing_frame: "Resolve on the finished cocktail and a restrained human payoff.",
        framing: "Close-up detail",
        movement: "Locked or micro push",
        lens: "85mm",
      },
    };
  }

  if (/cocktail|drink|glass|bottle/.test(text)) {
    return {
      emotion: "desire",
      objective: "Make premium cocktails feel tactile and real through precise ingredients, glassware, condensation, reflections, and service behavior.",
      first: {
        title: "Premium Cocktails — Craft Action",
        purpose: "Show a specific pour, shake, garnish, stir, or finishing action with credible liquid physics.",
        opening_frame: "Begin on authentic ingredients, tools, and branded bar context before the finishing action starts.",
        closing_frame: "End as the cocktail reaches its finished visual state.",
        framing: "Macro and close product frame",
        movement: "Controlled slider or locked macro",
        lens: "90mm macro",
      },
      second: {
        title: "Premium Cocktails — Hero Serve",
        purpose: "Present the finished drink in real service context with an elegant handoff and human reaction.",
        opening_frame: "Cut to the finished glass with correct label, garnish, reflections, condensation, and bar material truth.",
        closing_frame: "Resolve on the guest receiving or appreciating the drink.",
        framing: "Product close-up with human context",
        movement: "Subtle push or rack focus",
        lens: "65mm",
      },
    };
  }

  if (/dj|booth|mixer|deck/.test(text)) {
    return {
      emotion: "momentum",
      objective: "Build performance energy through authentic DJ technique, equipment detail, timing, and audience response.",
      first: {
        title: "DJ Performance — Technique & Booth",
        purpose: "Show credible hand movement, mixer interaction, headphone behavior, and booth geography.",
        opening_frame: "Begin on the real booth with the DJ physically connected to the mixer and track timing.",
        closing_frame: "End on the decisive control action that triggers the next energy change.",
        framing: "Medium performance frame",
        movement: "Motivated lateral move or restrained push",
        lens: "35mm",
      },
      second: {
        title: "DJ Performance — Detail & Crowd Response",
        purpose: "Connect the DJ's control action to a precise crowd, light, or performer reaction.",
        opening_frame: "Cut to hands, mixer lights, headphone cue, facial focus, or the first audience response.",
        closing_frame: "Resolve as the room energy visibly lifts.",
        framing: "Close-up and reaction insert",
        movement: "Locked detail or short push",
        lens: "75mm",
      },
    };
  }

  if (/crowd|dance|dancefloor|smoke|lighting/.test(text)) {
    return {
      emotion: "release",
      objective: "Show real crowd energy with individual human behavior, layered depth, stable faces, controlled smoke, and motivated lighting.",
      first: {
        title: "Dancefloor Energy — Layered Wide",
        purpose: "Establish the real dancefloor, crowd layers, screen direction, lighting rhythm, and spatial energy.",
        opening_frame: "Begin on a readable wide composition with distinct foreground, middle, and background behavior.",
        closing_frame: "End when a synchronized music or light cue unifies the crowd.",
        framing: "Wide layered crowd frame",
        movement: "Controlled crane-like rise, push, or stable lateral travel",
        lens: "24mm",
      },
      second: {
        title: "Dancefloor Energy — Human Micro-moments",
        purpose: "Prove reality through specific smiles, gestures, reactions, friendships, smoke interaction, and light contact.",
        opening_frame: "Cut to one believable human micro-moment that continues the established rhythm.",
        closing_frame: "Resolve on a reaction that hands energy into the climax.",
        framing: "Medium close-up with environmental depth",
        movement: "Short motivated move",
        lens: "50mm",
      },
    };
  }

  if (/climax|synchronized|peak/.test(text)) {
    return {
      emotion: "euphoria",
      objective: "Deliver the film's peak through synchronized crowd, lighting, music, and visual motif without losing physical realism.",
      first: {
        title: "Climax — Synchronized Room Peak",
        purpose: "Unify the DJ cue, lighting change, crowd response, and venue identity in one controlled peak image.",
        opening_frame: "Begin one beat before the peak with visible anticipation across performer, crowd, and light.",
        closing_frame: "End at the strongest synchronized wide frame of the venue experience.",
        framing: "Hero wide frame",
        movement: "Decisive but controlled push or rise",
        lens: "28mm",
      },
      second: {
        title: "Climax — Emotional Payoff",
        purpose: "Land the peak through a memorable human reaction and brand-specific visual detail.",
        opening_frame: "Cut from the wide peak to a precise face, gesture, glass, performer, or light reflection.",
        closing_frame: "Resolve on an image clean enough to transition into the endcard.",
        framing: "Emotional close-up",
        movement: "Slow final push",
        lens: "75mm",
      },
    };
  }

  if (/logo|cta|handle|invitation|endcard/.test(text)) {
    return {
      emotion: "invitation",
      objective: "Create a clean brand-authentic end frame with exact logo geometry and safe composition for typography added in post-production.",
      first: {
        title: "Brand Reveal — Authentic Logo Frame",
        purpose: "Reveal the approved logo or venue identity using a real reference and stable geometry.",
        opening_frame: "Begin on a final venue, sign, material, or atmospheric image with negative space reserved for typography.",
        closing_frame: "Resolve on the exact approved logo or brand mark with no generated spelling.",
        framing: "Centered brand hero frame",
        movement: "Locked or near-static",
        lens: "50mm",
      },
      second: {
        title: "Invitation CTA — Post-production Endcard",
        purpose: "Hold a clean release-ready frame for invitation copy, social handle, and channel-specific CTA applied in post.",
        opening_frame: "Cut to a clean brand field or venue image with safe title margins and strong contrast.",
        closing_frame: "Finish on a stable two-second endcard hold with no AI-rendered text.",
        framing: "Graphic-safe endcard composition",
        movement: "Static hold",
        lens: "50mm",
      },
    };
  }

  return {
    emotion: "progression",
    objective: `Deliver ${beatTitle(value)} as a specific, believable story beat grounded in the real venue and approved references.`,
    first: {
      title: `${beatTitle(value)} — Establishing Action`,
      purpose: `Establish the geography, subject, and primary action for ${beatTitle(value)}.`,
      opening_frame: `Begin on a stable, specific composition that immediately communicates ${beatTitle(value)}.`,
      closing_frame: "End on a motivated action transition.",
      framing: "Wide or medium-wide",
      movement: "Controlled motivated move",
      lens: "35mm",
    },
    second: {
      title: `${beatTitle(value)} — Detail & Payoff`,
      purpose: `Reveal the tactile detail, reaction, or product truth that completes ${beatTitle(value)}.`,
      opening_frame: "Cut to a precise continuity-matched detail or reaction.",
      closing_frame: "Resolve on a clean payoff frame.",
      framing: "Close-up or medium close-up",
      movement: "Subtle push or locked detail",
      lens: "65mm",
    },
  };
}

function defaultReferencePack() {
  return {
    required_roles: [
      "venue_reference",
      "brand_reference",
      "product_reference",
      "identity_reference",
    ],
    preserve: [
      "Recognizable venue architecture",
      "Approved logo geometry and spelling",
      "Exact product proportions and labels",
      "Real people identity when referenced",
      "Brand colors, materials, and lighting character",
    ],
    may_change: [
      "Camera position",
      "Editorial framing",
      "Background extras",
      "Cinematic light intensity",
    ],
    never_change: [
      "Face identity",
      "Logo spelling or geometry",
      "Product label or proportions",
      "Core venue architecture",
    ],
  };
}

function defaultContinuity(sceneTitle, leaving) {
  return {
    entering: `Continue established venue, wardrobe, prop, product, and lighting truth into ${sceneTitle}.`,
    leaving,
    locks: [
      "Wardrobe",
      "Props",
      "Product state",
      "Screen direction",
      "Eye lines",
      "Light direction",
      "Venue architecture",
    ],
  };
}

function defaultRealityRules() {
  return {
    human: [
      "Natural blinking, breathing, balance, and reaction timing",
      "Stable faces, hands, fingers, and eye focus",
      "Believable body mechanics and contact",
    ],
    physical: [
      "Correct gravity, momentum, liquid, flame, smoke, and object persistence",
      "Stable reflections, contact shadows, labels, and materials",
      "No teleporting, morphing, or duplicate objects",
    ],
    environment: [
      "Plausible independent background behavior",
      "Stable signage and architecture",
      "No crowd loops or cloned people",
    ],
  };
}

function defaultQualityRequirements() {
  return {
    identity_fidelity: 95,
    product_fidelity: 98,
    brand_fidelity: 98,
    physical_reality: 94,
    continuity: 95,
    emotional_readability: 92,
    minimum_score: 90,
    minimum_video_score: 90,
  };
}

function makeShot({
  beat,
  sceneTitle,
  duration,
  profile,
  definition,
  donorShot = {},
  number,
}) {
  const safeDuration = Math.max(1, Math.round(duration));
  const continuity = {
    ...defaultContinuity(
      sceneTitle,
      number === 1
        ? `Advance into the detail and payoff of ${sceneTitle}.`
        : `Resolve ${sceneTitle} and motivate the next required story beat.`,
    ),
    ...(donorShot.continuity || {}),
  };

  return {
    ...clone(donorShot),
    shot_number: number,
    title: definition.title,
    purpose: definition.purpose,
    duration_seconds: safeDuration,
    opening_frame: definition.opening_frame,
    closing_frame: definition.closing_frame,
    action_beats: [
      {
        at_seconds: 0,
        action: `Begin ${definition.purpose.toLowerCase()} from a stable, readable frame.`,
      },
      {
        at_seconds: Math.max(0, safeDuration - 1),
        action: number === 1
          ? "Complete the primary action while preserving a clean continuity handoff."
          : "Land the emotional, product, or brand payoff on a stable editorial frame.",
      },
    ],
    performance_direction:
      donorShot.performance_direction ||
      "Direct restrained micro-expressions, natural breathing, credible hand contact, stable eye lines, and precise reaction timing.",
    camera: {
      ...(donorShot.camera || {}),
      framing: definition.framing,
      movement: definition.movement,
      lens: definition.lens,
      angle: donorShot.camera?.angle || "Natural eye level unless the beat motivates another angle",
      focus: donorShot.camera?.focus || "Keep the narrative subject, action, product, and venue truth legible",
    },
    lighting: {
      direction: "Motivated by real practical sources in the approved venue",
      quality: "Controlled cinematic contrast with realistic skin, material, flame, smoke, and reflection behavior",
      continuity: "Match practical-source direction, exposure, color temperature, and shadow logic across adjacent shots",
      ...(donorShot.lighting || {}),
    },
    actors: Array.isArray(donorShot.actors) ? donorShot.actors : [],
    products: Array.isArray(donorShot.products) ? donorShot.products : [],
    dialogue: Array.isArray(donorShot.dialogue) ? donorShot.dialogue : [],
    narration: donorShot.narration || {},
    music: donorShot.music || {
      function: `Support the ${profile.emotion} turn and synchronize the editorial handoff without overpowering location truth.`,
    },
    sound_effects: Array.isArray(donorShot.sound_effects) && donorShot.sound_effects.length
      ? donorShot.sound_effects
      : [
          "Venue-specific room tone",
          "Tactile action and contact Foley",
          "Motivated transition accent",
        ],
    subtitles: Array.isArray(donorShot.subtitles) ? donorShot.subtitles : [],
    reference_asset_ids: Array.isArray(donorShot.reference_asset_ids)
      ? donorShot.reference_asset_ids.filter(Boolean)
      : [],
    reference_pack: {
      ...defaultReferencePack(),
      ...(donorShot.reference_pack || {}),
    },
    continuity,
    reality_rules: {
      ...defaultRealityRules(),
      ...(donorShot.reality_rules || {}),
    },
    negative_constraints: [
      ...new Set([
        ...(Array.isArray(donorShot.negative_constraints) ? donorShot.negative_constraints : []),
        "No morphing or identity drift",
        "No broken anatomy or unstable hands",
        "No fake generated text or altered logo spelling",
        "No flicker, cloned people, or duplicated objects",
        "No impossible liquid, flame, smoke, gravity, or reflections",
        "No unmotivated camera movement",
      ]),
    ],
    quality_requirements: {
      ...defaultQualityRequirements(),
      ...(donorShot.quality_requirements || {}),
    },
    transition_in: donorShot.transition_in || {
      type: number === 1 ? "motivated_scene_cut" : "match_action_cut",
      continuity: "Preserve screen direction, action state, eye lines, practical-light direction, and reference truth.",
    },
    transition_out: donorShot.transition_out || {
      type: number === 1 ? "match_action_cut" : "editorial_payoff_cut",
      continuity: "Leave a clean closing frame that motivates the following shot or scene.",
    },
    metadata: {
      ...(donorShot.metadata || {}),
      required_story_beat: beat,
      story_beat_convergence: true,
    },
  };
}

function buildScene({ beat, sceneNumber, donorScene = null }) {
  const title = beatTitle(beat) || `Required Story Beat ${sceneNumber}`;
  const duration = beatDuration(beat, donorScene?.duration_seconds || 4);
  const firstDuration = Math.max(1, Math.floor(duration / 2));
  const secondDuration = Math.max(1, duration - firstDuration);
  const profile = profileForBeat(beat);
  const donorShots = Array.isArray(donorScene?.shots)
    ? donorScene.shots.filter(Boolean)
    : [];

  return {
    ...clone(donorScene || {}),
    scene_number: sceneNumber,
    title,
    objective: profile.objective,
    emotion: donorScene?.emotion || profile.emotion,
    duration_seconds: firstDuration + secondDuration,
    location: donorScene?.location || {},
    actors: Array.isArray(donorScene?.actors) ? donorScene.actors : [],
    products: Array.isArray(donorScene?.products) ? donorScene.products : [],
    brand_rules: [
      ...new Set([
        ...(Array.isArray(donorScene?.brand_rules) ? donorScene.brand_rules : []),
        "Use only approved venue, product, identity, and brand references",
        "Apply exact typography and social handle in post-production, not inside generated imagery",
      ]),
    ],
    visual_style: {
      realism: "photorealistic premium commercial cinema grounded in the real venue",
      texture: "authentic skin, materials, glass, liquids, practical light, smoke, and reflections",
      ...(donorScene?.visual_style || {}),
    },
    camera_style: {
      language: "motivated, restrained, editorially varied, and physically plausible",
      ...(donorScene?.camera_style || {}),
    },
    audio_style: {
      language: "venue-specific room tone, tactile Foley, precise transition sound, and purposeful music escalation",
      ...(donorScene?.audio_style || {}),
    },
    humor: donorScene?.humor || {
      mechanism: "none unless a specific human observation supports the story",
      setup: "",
      expectation: "",
      reversal: "",
      reaction: "",
      payoff: "",
    },
    shots: [
      makeShot({
        beat,
        sceneTitle: title,
        duration: firstDuration,
        profile,
        definition: profile.first,
        donorShot: donorShots[0] || {},
        number: 1,
      }),
      makeShot({
        beat,
        sceneTitle: title,
        duration: secondDuration,
        profile,
        definition: profile.second,
        donorShot: donorShots[1] || donorShots[0] || {},
        number: 2,
      }),
    ],
    metadata: {
      ...(donorScene?.metadata || {}),
      required_story_beat: beat,
      story_beat_convergence: donorScene
        ? "AI_SCENE_REUSED"
        : "MISSION_BEAT_SYNTHESIZED",
    },
  };
}

export function convergeCreativeStoryBeats({
  creativePlan,
  brief = {},
  targetDuration = 30,
} = {}) {
  const plan = clone(creativePlan) || {};
  const sourceScenes = Array.isArray(plan.scenes)
    ? plan.scenes.filter(Boolean)
    : [];
  const beats = requiredStoryBeats(brief);

  if (!beats.length) return plan;

  const used = new Set();
  let reused = 0;
  let synthesized = 0;

  const scenes = beats.map((beat, index) => {
    let bestIndex = -1;
    let bestScore = 0;

    sourceScenes.forEach((scene, sceneIndex) => {
      if (used.has(sceneIndex)) return;
      const score = scoreSceneForBeat(scene, beat);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = sceneIndex;
      }
    });

    const donorScene = bestIndex >= 0 && bestScore > 0
      ? sourceScenes[bestIndex]
      : null;

    if (donorScene) {
      used.add(bestIndex);
      reused += 1;
    } else {
      synthesized += 1;
    }

    return buildScene({
      beat,
      sceneNumber: index + 1,
      donorScene,
    });
  });

  const plannedDuration = scenes.reduce(
    (total, scene) => total + Number(scene.duration_seconds || 0),
    0,
  );

  return {
    ...plan,
    scenes,
    metadata: {
      ...(plan.metadata || {}),
      story_beat_convergence: {
        source: "MISSION_REQUIRED_STORY_BEATS",
        required_scene_count: beats.length,
        source_scene_count: sourceScenes.length,
        reused_scene_count: reused,
        synthesized_scene_count: synthesized,
        source_planned_duration_seconds: plannedDuration,
        target_duration_seconds: Number(targetDuration || plannedDuration),
      },
    },
  };
}
