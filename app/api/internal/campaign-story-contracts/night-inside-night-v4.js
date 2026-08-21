export const CHURCHILL_NIGHT_CHANGES_STORY_VERSION = "CHURCHILL_NIGHT_CHANGES_CANONICAL_STORY_V4";

const beat = (id, seconds, description, signature = null) => Object.freeze({
  id,
  target_seconds: seconds,
  mandatory: true,
  description,
  signature,
});

export const CHURCHILL_NIGHT_CHANGES_STORY = Object.freeze({
  version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  title: "CHURCHILL — THE NIGHT INSIDE THE NIGHT",
  duration_seconds: 90,
  user_story_locked: true,
  story_change_policy: Object.freeze({
    user_approval_required_for_story_removal: true,
    user_approval_required_for_story_reordering: true,
    user_approval_required_for_story_replacement: true,
    provider_fallback_may_not_change_story: true,
    runtime_failure_may_not_change_story: true,
    cost_optimization_may_not_change_story: true,
    additive_improvements_allowed_without_story_removal: true,
    proposed_replacements_must_be_presented_before_execution: true,
  }),
  authenticity_policy: Object.freeze({
    churchill_is_source_of_truth: true,
    exact_3d_logo_required: true,
    real_venue_geometry_required: true,
    real_singer_identity_required: true,
    real_band_identity_required: true,
    real_pool_required: true,
    real_shuffleboard_required: true,
    real_electric_darts_required: true,
    traditional_dartboard_forbidden: true,
    generated_singer_replacement_forbidden: true,
    generated_band_replacement_forbidden: true,
    generated_logo_replacement_forbidden: true,
    generated_venue_replacement_forbidden: true,
    generic_luxury_restaurant_replacement_forbidden: true,
    futuristic_rebuild_of_churchill_forbidden: true,
    effects_must_come_from_camera_time_reflection_physics_and_sound: true,
  }),
  world_class_signature: Object.freeze({
    churchill_pulse:
      "A restrained warm amber/orange physical light signature born from the exact 3D CC logo travels through real materials across the film: wine edge, ice refraction, pool-ball reflection, shuffleboard highlight, electronic-darts ring and finally the stage spotlight. It is never a sci-fi UI or fake venue redesign.",
    human_spine:
      "A natural group of 3–4 believable Churchill guests recurs through entrance, dinner, drinks, games and live music. They create emotional continuity while remaining secondary to the venue. In the nonlinear section, the same group may exist at several moments of the same night simultaneously.",
    replay_easter_eggs: Object.freeze([
      "Singer appears in wine or polished food reflection before the stage reveal.",
      "Electronic darts appear as a brief reflection in cutlery or glass before the dart sequence.",
      "Pool ball briefly contains a stage-light reflection.",
      "Cocktail shaker or glass catches the shuffleboard geometry before that scene happens.",
      "Exact CC geometry appears only as natural reflected shape/light, never generated text.",
    ]),
    social_talkability:
      "At least three frames should be screenshot-worthy on their own: the Churchill worlds inside suspended wine, camera travelling through frozen ice/liquid, and the final whole-venue freeze with one wine droplet still moving.",
    avantiqo_proof_layer: Object.freeze({
      main_film_rule:
        "The hero film remains a Churchill advertisement. Avantiqo must never interrupt the Churchill story with dashboards, software UI or sales copy.",
      end_credit:
        "After the Churchill logo resolves, an optional restrained two-second micro-credit may read CREATED IN AVANTIQO · Autonomous Creative Studio, only if it does not weaken the Churchill logo hold.",
      derivative_case_study:
        "Create a separate Avantiqo proof cut from the same production showing authentic Churchill source references versus the finished cinematic shots, proving strategy, direction, VFX, sound and assembly inside Avantiqo.",
    }),
  }),
  recurring_motif:
    "Reflections show future Churchill moments before they happen. The film loops back into the original wine/glass so the audience realizes the night may have existed inside the reflection all along.",
  canonical_beats: Object.freeze([
    beat("logo_prologue", 5, "Open with the exact Churchill 3D logo. Extend the existing short logo motion into a premium dimensional reveal with restrained amber/gold light, realistic material response and a sophisticated after-effect. No generic logo animation.", "The first Churchill Pulse originates here."),
    beat("entrance_into_night", 5, "Use the real Churchill entrance. Elegant forward camera movement enters the authentic venue. A practical reflection/light event hints that physical reality will behave differently inside.", "The Churchill Pulse briefly catches real glass/metal/wood and disappears."),
    beat("wine_universe", 7, "A wine-glass/red-wine moment becomes the first major impossible-reality signature. Extreme macro liquid physics: suspended red-wine droplets or a moving wine surface contain miniature Churchill realities — dinner, bar, pool, electronic darts, shuffleboard and live singer/band. Camera chooses one droplet/reflection and travels through it into dinner. No sci-fi graphics; it must look physically photographed.", "Screenshot moment #1. Singer is foreshadowed in one wine reflection."),
    beat("dinner_future_reflections", 7, "Real Churchill dining and real Churchill food. Macro food, cutlery, candlelight, wine and steam. Reflections foreshadow later moments. The recurring guest group is introduced naturally here. Singer identity may appear only as a real-reference reflection/foreshadow, never as a generic replacement.", "Cutlery/glass can foreshadow electronic darts and stage."),
    beat("steam_into_bar", 4, "Real food steam becomes bar atmosphere/mist and carries the camera into the real Churchill bar world as one continuous physical event.", "Churchill Pulse reappears as a warm practical edge in the mist."),
    beat("ice_time_freeze", 8, "At the real Churchill bar, ice and liquid become the second signature VFX event. Bartender action/ice throw or pour triggers freeze-time: people, liquid, droplets and ice are suspended while only the camera moves. Camera travels between suspended droplets and ice. One ice cube refracts the real Churchill pool room; camera enters the cube and the cube becomes a cue ball. This beat may never be removed for provider convenience.", "Screenshot moment #2. Churchill Pulse is visible only as realistic refraction inside the ice."),
    beat("pool_activation", 6, "Ice-to-cue-ball resolves into the real Churchill pool room. Preserve exact table geometry, amber look and Churchill branding/orientation. Pool impact becomes part of the soundtrack. Camera follows the ball toward lens.", "Pool ball briefly contains the future stage light."),
    beat("pool_to_shuffleboard", 5, "Pool-ball foreground occlusion becomes the real Churchill shuffleboard puck. Camera runs extremely low over the actual table and scoring area. Preserve the real table proportions, wood and markings.", "Churchill Pulse skims naturally along polished wood."),
    beat("shuffleboard_to_dart", 4, "Shuffleboard puck reaches/falls from the scoring end and transforms into a dart. A hand catches it. The transformation is physically elegant, fast and believable rather than cartoonish.", null),
    beat("electric_dart_flight", 7, "Viewer travels with the dart through Churchill. It passes authentic venue layers — diners, bar, pool, shuffleboard and stage preparation — and targets Churchill's real electronic darts equipment. Traditional/sisal dartboards are forbidden. Bullseye impact creates a brief silence. The electronic-dart circular light expands into the stage spotlight.", "High-replay action beat. Churchill Pulse reaches the electronic-darts ring."),
    beat("band_activates_churchill", 7, "Stage spotlight reveals the real singer and real Churchill band. The first live note starts. Musical hits activate Churchill spatially: kick -> bar, snare -> pool, bass -> dinner, keyboard -> shuffleboard, guitar/percussion -> electronic darts. Full band means the full venue becomes alive. Never replace singer or musicians with generated identities.", "Goosebumps moment: the Churchill Pulse finally becomes the real stage light."),
    beat("many_realities_same_night", 6, "Time becomes nonlinear. Camera moves through Churchill while the same recurring guest group exists at several stages of the night at once: dinner, cocktails, pool, shuffleboard, electronic darts, live music and dancing/social energy. This is one physical venue containing several temporal realities, not split-screen or hologram UI.", "Hidden future/past reflections reward repeat viewing."),
    beat("frozen_night_hero", 7, "Singer holds a note and the entire Churchill night freezes. Camera travels continuously through wine mid-pour, suspended cocktail liquid, real food/cutlery action, pool ball in motion, shuffleboard puck moving, electronic dart in flight, drummer and singer frozen mid-performance and guests frozen mid-laugh/dance. One suspended red-wine droplet still contains a moving Churchill reality. Camera enters it.", "Screenshot moment #3 and the film's biggest visual proof."),
    beat("wine_loop_return", 4, "Return through the wine/glass to the original dinner reality. A guest completes a simple natural action such as lifting or setting down the glass. The loop reveals that the entire night may have existed inside the reflection/drop.", null),
    beat("logo_epilogue", 8, "Finish with the exact Churchill 3D logo. Longer and better than the existing short version: premium dimensional movement, elegant afterglow/effect and clean hold. Primary copy remains Churchill. Optional final copy: DINNER · DRINKS · PLAY · LIVE / THE NIGHT CHANGES HERE. / KARON · PHUKET.", "Optional final two-second CREATED IN AVANTIQO micro-credit only after Churchill resolves and only if it does not weaken Churchill."),
  ]),
  sound_design_contract: Object.freeze({
    mandatory: true,
    voiceover_required: false,
    concept: "Churchill venue sounds become the musical grammar before the real band takes over.",
    sound_events: Object.freeze([
      "pool break -> kick / low impact",
      "shuffleboard puck -> percussion",
      "ice / shaker -> hi-hat texture",
      "cutlery / plate -> rhythmic detail",
      "glass clink -> bell/transient",
      "electronic dart flight/impact -> rising action + snare/impact",
      "wine movement/cork/pour -> low tonal transition",
      "bullseye -> 0.3–0.5 seconds near-silence -> real band activation",
    ]),
  }),
  implementation_policy: Object.freeze({
    do_not_generate_as_one_90_second_prompt: true,
    use_controlled_short_shots: true,
    use_real_churchill_media_for_identity_and_geometry: true,
    use_generated_vfx_only_for_impossible_physics_and_camera_events: true,
    transition_endpoints_must_land_on_authentic_churchill_frames: true,
    provider_fallback_changes_provider_not_story: true,
    exact_logo_composited_from_master_asset: true,
    final_master_requires_visual_review_before_publication: true,
  }),
});

export function assertChurchillNightStoryIntegrity(story = CHURCHILL_NIGHT_CHANGES_STORY) {
  const requiredBeatIds = [
    "logo_prologue",
    "entrance_into_night",
    "wine_universe",
    "dinner_future_reflections",
    "steam_into_bar",
    "ice_time_freeze",
    "pool_activation",
    "pool_to_shuffleboard",
    "shuffleboard_to_dart",
    "electric_dart_flight",
    "band_activates_churchill",
    "many_realities_same_night",
    "frozen_night_hero",
    "wine_loop_return",
    "logo_epilogue",
  ];
  const beats = new Map((story?.canonical_beats || []).map((item) => [item.id, item]));
  const missing = requiredBeatIds.filter((id) => !beats.get(id)?.mandatory);
  if (missing.length) throw new Error(`CHURCHILL_CANONICAL_STORY_MISSING:${missing.join(",")}`);
  const seconds = Number((story?.canonical_beats || []).reduce((sum, item) => sum + Number(item.target_seconds || 0), 0).toFixed(3));
  if (seconds !== 90) throw new Error(`CHURCHILL_CANONICAL_STORY_DURATION_INVALID:${seconds}`);
  if (story?.story_change_policy?.provider_fallback_may_not_change_story !== true) {
    throw new Error("CHURCHILL_STORY_PROVIDER_FALLBACK_LOCK_REQUIRED");
  }
  return true;
}
