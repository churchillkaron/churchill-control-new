const CAPABILITY_EXECUTION_MAP = {
  TEXT_AI: [
    "ai.text.generate",
    "ai.reasoning.execute",
  ],

  IMAGE_AI: [
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
    "ai.image.upscale",
    "ai.image.analyze",
  ],

  VIDEO_AI: [
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.first_last_frame_to_video",
    "ai.video.video_to_video",
    "ai.video.edit",
    "ai.video.inpaint",
    "ai.video.extend",
    "ai.video.upscale",
    "ai.video.lipsync",
  ],

  VOICE_AI: [
    "ai.voice.generate",
    "ai.speech.to.text",
    "ai.text.to.speech",
  ],

  AUDIO_AI: [
    "ai.music.generate",
    "ai.sfx.generate",
  ],

  GENERATE_TEXT: ["ai.text.generate"],
  REASONING: ["ai.reasoning.execute"],

  GENERATE_IMAGE: ["ai.image.generate"],
  EDIT_IMAGE: ["ai.image.edit"],
  INPAINT_IMAGE: ["ai.image.inpaint"],
  OUTPAINT_IMAGE: ["ai.image.outpaint"],
  UPSCALE_IMAGE: ["ai.image.upscale"],
  IMAGE_ANALYSIS: ["ai.image.analyze"],

  GENERATE_VIDEO: ["ai.video.generate"],
  IMAGE_TO_VIDEO: ["ai.video.image_to_video"],
  FIRST_LAST_FRAME_TO_VIDEO: ["ai.video.first_last_frame_to_video"],
  KEYFRAME_TO_VIDEO: ["ai.video.first_last_frame_to_video"],
  VIDEO_TO_VIDEO: ["ai.video.video_to_video"],
  EDIT_VIDEO: ["ai.video.edit"],
  INPAINT_VIDEO: ["ai.video.inpaint"],
  EXTEND_VIDEO: ["ai.video.extend"],
  UPSCALE_VIDEO: ["ai.video.upscale"],
  LIPSYNC: ["ai.video.lipsync"],

  GENERATE_VOICE: ["ai.voice.generate"],
  SPEECH_TO_TEXT: ["ai.speech.to.text"],
  TEXT_TO_SPEECH: ["ai.text.to.speech"],
  GENERATE_MUSIC: ["ai.music.generate"],
  GENERATE_SFX: ["ai.sfx.generate"],
  TRANSLATE: ["ai.translate"],
  EMBEDDINGS: ["ai.embeddings.create"],
  MODERATION: ["ai.moderation.execute"],

  OCR: [
    "document.ocr",
    "document.classify",
  ],

  TRANSLATION: ["ai.translate"],
  FACEBOOK: [
    "marketing.facebook.publish",
    "communication.facebook.messenger.send",
  ],
  INSTAGRAM: [
    "marketing.instagram.publish",
    "communication.instagram.send",
  ],
  META_ADS: ["marketing.ads.manage"],
  GOOGLE_BUSINESS: [
    "marketing.google.business.locations.read",
    "reputation.review.read",
    "reputation.review.reply",
    "marketing.google.business.publish",
    "marketing.google.business.media.publish",
  ],
  GOOGLE_ADS: ["marketing.google.ads.manage"],
  WHATSAPP: ["communication.whatsapp.send"],
  LINE: ["communication.line.send"],
};

function directCapability(value) {
  const normalized = String(value || "").trim();
  return normalized.includes(".") ? normalized : null;
}

export function resolveExecutionCapabilities(businessCapabilities = []) {
  return [
    ...new Set(
      businessCapabilities.flatMap((capability) => {
        const direct = directCapability(capability);
        if (direct) return [direct];
        return CAPABILITY_EXECUTION_MAP[capability] || [];
      }),
    ),
  ];
}

export function resolvePrimaryExecutionCapability(businessCapabilities = []) {
  return resolveExecutionCapabilities(businessCapabilities)[0] || null;
}
