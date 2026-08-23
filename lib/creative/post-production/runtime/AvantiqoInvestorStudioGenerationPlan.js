const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";

const sharedFilmRules = Object.freeze([
  "FRESH_AVANTIQO_STUDIO_GENERATION_REQUIRED",
  "AVANTIQO_OWNED_AI_ENGINES_ONLY",
  "NO_EXTERNAL_AI_PROVIDER_FALLBACK",
  "REFERENCE_ASSETS_ARE_GROUNDING_ONLY_NOT_FINAL_INSERTS",
  "NO_PRODUCT_SCREENSHOTS",
  "NO_EXTRACTED_SCREENSHOT_FRAGMENTS",
  "NO_BROWSER_WINDOWS",
  "NO_SCREEN_INSIDE_SCREEN",
  "NO_GENERIC_AI_ORB",
  "NO_CARD_WALLS",
  "NO_REPEATED_HERO_FOOTAGE_ACROSS_CONSECUTIVE_SCENES",
  "NO_GIANT_EXPLANATORY_CAPTIONS",
  "REAL_CAPABILITIES_AND_REAL_BUSINESS_RELATIONSHIPS_ONLY",
  "OFFICIAL_CHANNEL_OR_BRAND_MARKS_MAY_BE_COMPOSITED_AS EDITORIAL_IDENTITY_MARKS",
  "STUDIO_GENERATED_MEDIA_MUST_LOOK_PHOTOGRAPHIC_CINEMATIC_AND_NON_AI",
  "EVERY_SCENE_MUST_VISUALLY_ADVANCE_THE_NARRATION",
]);

const capabilityVisualLanguage = Object.freeze({
  COMMUNICATION: Object.freeze({
    create_now: [
      "fresh cinematic communication environment",
      "message arrival and intent recognition choreography",
      "one customer identity forming from multiple channels",
      "business action visibly created from the conversation",
    ],
    editorial_marks: [
      "WhatsApp",
      "LINE",
      "Messenger",
      "Facebook",
      "Instagram",
      "Google Reviews",
      "Email",
      "Website",
    ],
    forbidden: ["communications UI screenshot", "chat app screenshot", "logo wall without action"],
  }),
  CREATIVE_STUDIO: Object.freeze({
    create_now: [
      "fresh concept frames",
      "fresh campaign key visual",
      "fresh poster artwork",
      "fresh social variants",
      "fresh video frames",
      "fresh motion treatment",
    ],
    narrative: "SHOW_AVANTIQO_STUDIO_CREATING_THE_WORK_NOT_DISPLAYING_OLD_WORK",
    forbidden: ["Creative Studio UI screenshot", "reused finished campaign", "old poster inserted as proof"],
  }),
  CODE: Object.freeze({
    create_now: [
      "cinematic repository topology",
      "real changed-file evidence translated into motion graphics",
      "real diff logic translated into motion typography",
      "test failure to repair to pass sequence",
    ],
    grounding: "REAL_REPOSITORY_FACTS_ONLY",
    forbidden: ["GitHub screenshot", "terminal screenshot", "invented code achievement"],
  }),
  OPERATE: Object.freeze({
    create_now: [
      "fresh real-world execution scene",
      "decision becoming governed action",
      "task state and completion evidence as spatial motion graphics",
    ],
    forbidden: ["operator UI screenshot", "generic dashboard"],
  }),
  MUSIC: Object.freeze({
    create_now: [
      "fresh Avantiqo-generated score or music element",
      "stems and rhythm represented as cinematic spatial waveforms",
      "music resolving into the film output",
    ],
    grounding: "ACTUAL_GENERATED_AUDIO_OUTPUT",
    forbidden: ["music app screenshot", "generic equalizer wallpaper"],
  }),
  SPEECH: Object.freeze({
    create_now: [
      "fresh Avantiqo-generated speech output",
      "voice activity and phoneme timing represented cinematically",
      "speech resolving into narration or business action",
    ],
    grounding: "ACTUAL_GENERATED_VOICE_OUTPUT",
    forbidden: ["voice provider screenshot", "generic waveform with no real audio relationship"],
  }),
  INTEGRATIONS: Object.freeze({
    create_now: [
      "fresh outward connection choreography",
      "organization context remains visually central",
      "external service marks enter and resolve into governed connections",
    ],
    forbidden: ["connected-services screenshot", "static logo wall"],
  }),
  BUSINESS_SYSTEM: Object.freeze({
    create_now: [
      "fresh live-action business footage appropriate to the spoken domain",
      "spatial data relationships derived from actual Avantiqo capabilities",
      "cause to business object to result",
    ],
    forbidden: ["dashboard screenshot", "repeated laptop operator hero", "unrelated industry substitute"],
  }),
});

export const AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN = Object.freeze({
  contract: "AVANTIQO_INVESTOR_STUDIO_GENERATION_V2_OWNED_ONLY",
  organization_id: ORGANIZATION_ID,
  investor_project_id: PROJECT_ID,
  owner: "AVANTIQO_CREATIVE_STUDIO",
  execution_boundary: "CREATIVE_STUDIO_TO_SERVICE_RUNTIME_AVANTIQO_OWNED_ONLY",
  provider_selection_exposed: false,
  owned_only_required: true,
  external_ai_provider_allowed: false,
  external_provider_fallback_allowed: false,
  existing_asset_policy: "GROUNDING_REFERENCE_ONLY",
  fresh_generation_policy: "MANDATORY_FROM_SCENE_09_FORWARD_EXCEPT_LOCKED_FOUNDER_OR_LOCKED_LOGO_WINDOWS",
  preserve_user_approved_scenes: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 10]),
  rebuild_scenes: Object.freeze([9, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
  shared_film_rules: sharedFilmRules,
  capability_visual_language: capabilityVisualLanguage,
  scene_generation: Object.freeze([
    Object.freeze({
      scene: 9,
      duration_seconds: 7.172,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh cinematic scene in which a living business becomes understandable as one connected reality: customer demand, people, operations, money and supply are sensed together and resolve into one coherent operating context. Use a new environment and new people created for this film. No software screens.",
      required_generation: ["ai.video.generate"],
      editorial_only: ["subtle relationship traces", "minimal Avantiqo brand light"],
    }),
    Object.freeze({
      scene: 11,
      duration_seconds: 7.594,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh cinematic shared-context sequence: a real business moment generates customer, operational, financial and organizational signals that converge into one governed context. The physical world remains hero; intelligence is expressed through restrained spatial motion graphics, never UI.",
      required_generation: ["ai.video.generate"],
    }),
    Object.freeze({
      scene: 12,
      duration_seconds: 7.172,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh cinematic multi-department sequence showing finance, operations, customers and intelligence as different real activities that become connected. Move between distinct environments and people, then visually connect the information without showing application screens.",
      required_generation: ["ai.video.generate"],
    }),
    Object.freeze({
      scene: 13,
      duration_seconds: 7.172,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh cause-to-action film beat: information arrives from the real world, Avantiqo intelligence turns it into a decision, and that decision visibly changes what people and the business do. Show information to decision to execution through cinematic action, not labels or dashboards.",
      required_generation: ["ai.video.generate"],
    }),
    Object.freeze({
      scene: 14,
      duration_seconds: 5.484,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh organization-context scene where people, legal entity, permissions, customers, suppliers and history are felt as one operating memory around a real business event. Use elegant depth and spatial relationships with minimal text and no software screen.",
      required_generation: ["ai.video.generate"],
    }),
    Object.freeze({
      scene: 15,
      duration_seconds: 5.484,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh cinematic passage across different business functions and locations that feels like one continuous operating system. The camera should move through distinct real activities while a restrained shared-context visual motif persists across them.",
      required_generation: ["ai.video.generate"],
    }),
    Object.freeze({
      scene: 16,
      duration_seconds: 2.954,
      capability: "OPERATE",
      objective: "Create a concise fresh cinematic moment showing software with context becoming action: a real business signal is understood and a governed next action starts immediately. No person sitting at a laptop, no dashboard, no explanatory headline.",
      required_generation: ["ai.video.generate"],
    }),
    Object.freeze({
      scene: 17,
      duration_seconds: 5.625,
      capability: "COMMUNICATION",
      objective: "Create a fresh premium communication sequence: a customer reaches the business through real supported channels, the interaction resolves into one customer identity and context, and Avantiqo creates a meaningful business action from it. Official channel marks may enter as editorial motion elements. No messaging screenshots and no static logo wall.",
      required_generation: ["ai.video.generate"],
      editorial_only: capabilityVisualLanguage.COMMUNICATION.editorial_marks,
    }),
    Object.freeze({
      scene: 18,
      duration_seconds: 5.625,
      capability: "CREATIVE_STUDIO",
      objective: "Show Avantiqo Creative Studio creating a campaign now. Begin with a business objective and customer context, then visibly originate a fresh concept, build a new key visual, generate a new poster, social variants and moving-video treatment, and resolve those outputs toward campaign channels and measurable result. Every creative asset in the scene must be newly created for this investor film.",
      required_generation: ["ai.image.generate", "ai.video.generate"],
      required_fresh_outputs: ["key_visual", "poster", "social_variant", "video_frame_sequence"],
    }),
    Object.freeze({
      scene: 19,
      duration_seconds: 5.625,
      capability: "BUSINESS_SYSTEM",
      objective: "Create a fresh end-to-end service workflow in one continuous business reality: customer need becomes quotation, booking, task, real service execution and follow-up. Use a newly generated service environment and people for this film. Business objects should appear as elegant cinematic evidence, not application UI.",
      required_generation: ["ai.video.generate"],
      required_business_objects: ["quotation", "booking", "task", "service", "follow_up"],
    }),
  ]),
  final_act_surface_generation: Object.freeze({
    COMMUNICATION: capabilityVisualLanguage.COMMUNICATION,
    CREATIVE_STUDIO: capabilityVisualLanguage.CREATIVE_STUDIO,
    CODE: capabilityVisualLanguage.CODE,
    OPERATE: capabilityVisualLanguage.OPERATE,
    MUSIC: capabilityVisualLanguage.MUSIC,
    SPEECH: capabilityVisualLanguage.SPEECH,
    INTEGRATIONS: capabilityVisualLanguage.INTEGRATIONS,
  }),
  review_policy: "GENERATE_SCENE_THEN_RENDER_WITH_LOCKED_NARRATION_THEN_USER_VISUAL_APPROVAL_THEN_LOCK",
});

export default AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN;
