const FILM_LANGUAGE = Object.freeze({
  contract: "AVANTIQO_INVESTOR_CAPABILITY_VISUAL_LANGUAGE_V1",
  principle: "REAL_CAPABILITY_TO_FRESH_STUDIO_CREATION_TO_CINEMATIC_PROOF",
  source_truth: "REAL_AVANTIQO_SYSTEM_AND_CAPABILITIES",
  screen_policy: "SCREENS_ARE_REFERENCE_AND_TRUTH_EVIDENCE_NOT_FILM_PIXELS",
  creation_policy: "THE_FILM_SHOWS_AVANTIQO_CREATING_AND_EXECUTING_NOT_DISPLAYING_SOFTWARE",
  composition: Object.freeze([
    "REAL_WORLD_ACTION_IS_THE_HERO_WHEN_A_PHYSICAL_ACTION_EXISTS",
    "FRESH_STUDIO_CREATED_MEDIA_IS_THE_HERO_WHEN_THE_CAPABILITY_CREATES_MEDIA",
    "TRANSPARENT_GLASS_AND_SPATIAL_MOTION_GRAPHICS_EXPLAIN_CAUSALITY_NOT_UI",
    "ONE_PRIMARY_VISUAL_IDEA_PER_BEAT",
    "MAX_FOUR_SUPPORT_SIGNALS",
    "MINIMAL_TYPOGRAPHY",
    "PREMIUM_DEPTH_LIGHT_REFLECTION_AND_CAMERA_MOVEMENT",
  ]),
  forbidden: Object.freeze([
    "PRODUCT_SCREENSHOT",
    "SCREENSHOT_FRAGMENT",
    "BROWSER_WINDOW",
    "APP_WINDOW",
    "FAKE_PRODUCT_UI",
    "CARD_WALL",
    "GENERIC_AI_ORB",
    "STATIC_LOGO_WALL",
    "REPEATED_LAPTOP_OPERATOR",
    "GIANT_EXPLANATORY_HEADLINE",
    "FAKE_METRIC",
    "UNVERIFIED_BUSINESS_RESULT",
  ]),
});

const CAPABILITIES = Object.freeze({
  ORGANIZATION_INTELLIGENCE: Object.freeze({
    truth: "Avantiqo understands organization-scoped business context across customers, people, operations, supply, finance, history and permissions.",
    visual_proof: Object.freeze([
      "A real business event starts in the physical world.",
      "Sparse customer, people, operational, supply and financial signals emerge from that event.",
      "Signals remain attached to their real business objects rather than becoming dashboard cards.",
      "A single restrained Avantiqo context line connects the signals and reveals that they belong to one organization reality.",
      "The connected context changes the next action in the physical scene.",
    ]),
  }),
  COMMUNICATION: Object.freeze({
    truth: "Supported communication channels resolve into shared customer and organization context and can lead to governed business actions.",
    visual_proof: Object.freeze([
      "A customer interaction arrives from a supported channel.",
      "Official channel identity appears briefly as an editorial mark, never as an app screenshot.",
      "The interaction resolves to one customer identity and relationship context.",
      "Intent becomes a real business object such as follow-up, quotation, booking or task.",
      "The resulting action is visible in the real-world scene.",
    ]),
    editorial_marks: Object.freeze([
      "WhatsApp",
      "LINE",
      "Messenger",
      "Facebook",
      "Instagram",
      "Google Reviews",
      "Email",
      "Website",
    ]),
  }),
  CREATIVE_STUDIO: Object.freeze({
    truth: "Avantiqo Creative Studio originates strategy and concepts, creates visual and temporal media, assembles variants and prepares campaign outputs.",
    visual_proof: Object.freeze([
      "Start from a real business objective and customer context, not a prompt box.",
      "A concept direction forms as spatial story beats and art-direction decisions.",
      "A fresh key visual is created inside the scene.",
      "The key visual develops into a newly created poster with typography, composition and brand treatment visibly assembling.",
      "The poster branches into fresh social formats while motion frames begin forming alongside it.",
      "The motion frames become a short video sequence with edit rhythm, transitions and sound relationship visible.",
      "The new campaign family resolves toward real channels and business outcome measurement without showing the Studio interface.",
    ]),
    required_fresh_media: Object.freeze([
      "KEY_VISUAL",
      "POSTER",
      "SOCIAL_VARIANT",
      "VIDEO_FRAME_SEQUENCE",
      "MOTION_TREATMENT",
    ]),
  }),
  CODE: Object.freeze({
    truth: "Avantiqo Code AI understands repository architecture, changes source, runs verification, reads failures and repairs until the required engineering state is reached.",
    visual_proof: Object.freeze([
      "Show a cinematic repository topology grounded in real repository paths.",
      "A real engineering problem highlights the affected architecture path.",
      "Only real changed-file and diff evidence becomes moving code typography.",
      "A build or test fails with the real failing check represented succinctly.",
      "The repair changes the relevant code relationship.",
      "The same verification resolves to pass.",
    ]),
  }),
  OPERATE: Object.freeze({
    truth: "Avantiqo can turn understood context into governed execution across the system.",
    visual_proof: Object.freeze([
      "A real signal or exception appears in the business environment.",
      "Avantiqo connects the signal to the correct business object and policy context.",
      "The governed next action begins.",
      "A person, workflow or connected system visibly carries out the action.",
      "Completion evidence closes the causal loop.",
    ]),
  }),
  MUSIC: Object.freeze({
    truth: "Avantiqo Music creates audio that can be used by Creative Studio and other Avantiqo experiences.",
    visual_proof: Object.freeze([
      "Music begins as structural rhythm and harmonic intent tied to the creative objective.",
      "Fresh generated stems form as spatial waveform layers.",
      "The layers combine into the actual generated music output.",
      "The music locks to the film edit or creative output in time.",
    ]),
  }),
  SPEECH: Object.freeze({
    truth: "Avantiqo Speech and Voice generate and understand spoken language as part of the same owned intelligence system.",
    visual_proof: Object.freeze([
      "Meaning or text becomes a voice performance.",
      "Actual voice timing appears as restrained activity and phoneme motion tied to the audio.",
      "The generated speech resolves into narration, dialogue or a business action.",
      "Speech understanding can flow back into Avantiqo context without showing a provider interface.",
    ]),
  }),
  INTEGRATIONS: Object.freeze({
    truth: "Connected services remain external endpoints while Avantiqo owns organization context, orchestration and governed execution.",
    visual_proof: Object.freeze([
      "Recognizable service identities appear individually as elegant editorial marks.",
      "A real event crosses the connection boundary.",
      "Avantiqo organization context stays visually central rather than the external service.",
      "The event becomes a governed Avantiqo business action.",
      "The result returns across the connection where appropriate.",
    ]),
  }),
});

const SCENE_CHOREOGRAPHY = Object.freeze({
  9: Object.freeze({
    capability: "ORGANIZATION_INTELLIGENCE",
    beats: Object.freeze([
      "Open on a fresh real business moment with multiple simultaneous activities in depth.",
      "Customer demand triggers one subtle signal; a staff action triggers another; stock movement and money movement appear as distinct spatial traces.",
      "The camera moves through the physical environment while the traces remain attached to the real actions.",
      "The traces connect into one organization context motif and immediately influence the next visible action.",
      "End on the business operating as one understood reality, not on a graphic interface.",
    ]),
  }),
  11: Object.freeze({
    capability: "ORGANIZATION_INTELLIGENCE",
    beats: Object.freeze([
      "One customer or operational event happens in the foreground.",
      "People, customer, operational and financial consequences appear at different depths around the event.",
      "The shared Avantiqo context line connects them without becoming a dashboard.",
      "The business response begins before the shot ends.",
    ]),
  }),
  12: Object.freeze({
    capability: "ORGANIZATION_INTELLIGENCE",
    beats: Object.freeze([
      "Move through distinct real activities representing customers, operations, finance and intelligence.",
      "Each activity has a different environment and visual rhythm.",
      "Match-motion and the shared context motif reveal that the activities are connected.",
      "Resolve all four into one continuous business reality.",
    ]),
  }),
  13: Object.freeze({
    capability: "OPERATE",
    beats: Object.freeze([
      "A real signal arrives.",
      "Context narrows the possible response to one governed decision.",
      "Approval or policy evidence flashes only as a small causal marker.",
      "The physical or digital action executes in the real world.",
      "Completion closes the line: information to decision to execution.",
    ]),
  }),
  14: Object.freeze({
    capability: "ORGANIZATION_INTELLIGENCE",
    beats: Object.freeze([
      "A person performs a real business action.",
      "Identity, role/permission, customer/supplier relationship and organization history appear as sparse contextual layers around the action.",
      "The action is understood differently because of that context.",
    ]),
  }),
  15: Object.freeze({
    capability: "ORGANIZATION_INTELLIGENCE",
    beats: Object.freeze([
      "Cross three different business functions or locations with elegant match cuts.",
      "The same Avantiqo context motif persists through each location.",
      "An object or event started in the first location changes work in the second and resolves in the third.",
    ]),
  }),
  16: Object.freeze({
    capability: "OPERATE",
    beats: Object.freeze([
      "A business signal appears inside a real action scene.",
      "Avantiqo context resolves the signal instantly.",
      "A governed next action visibly starts before the cut.",
    ]),
  }),
  17: Object.freeze({
    capability: "COMMUNICATION",
    beats: CAPABILITIES.COMMUNICATION.visual_proof,
  }),
  18: Object.freeze({
    capability: "CREATIVE_STUDIO",
    beats: CAPABILITIES.CREATIVE_STUDIO.visual_proof,
    required_fresh_media: CAPABILITIES.CREATIVE_STUDIO.required_fresh_media,
  }),
  19: Object.freeze({
    capability: "OPERATE",
    beats: Object.freeze([
      "A customer need starts the sequence.",
      "A quotation forms as a minimal spatial business object.",
      "The quotation becomes a booking, then a task.",
      "The real service is visibly performed.",
      "A follow-up closes the same customer relationship loop.",
    ]),
  }),
});

export function investorCapabilityVisual(capability) {
  return CAPABILITIES[String(capability || "").trim().toUpperCase()] || null;
}

export function investorSceneVisualChoreography(scene) {
  return SCENE_CHOREOGRAPHY[Number(scene)] || null;
}

export const AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY = Object.freeze({
  contract: "AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY_V1",
  film_language: FILM_LANGUAGE,
  capabilities: CAPABILITIES,
  scenes: SCENE_CHOREOGRAPHY,
  final_act_surfaces: Object.freeze([
    "COMMUNICATION",
    "CODE",
    "OPERATE",
    "CREATIVE_STUDIO",
    "MUSIC",
    "SPEECH",
    "INTEGRATIONS",
  ]),
});

export default AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY;
