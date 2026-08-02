const CAPABILITY_EXECUTION_MAP = {
  TEXT_AI: [
    "ai.text.generate",
    "ai.reasoning.execute",
  ],

  IMAGE_AI: [
    "ai.image.generate",
    "ai.image.analyze",
    "ai.image.upscale",
  ],

  VIDEO_AI: [
    "ai.video.generate",
    "ai.video.upscale",
    "ai.video.lipsync",
  ],

  VOICE_AI: [
    "ai.voice.generate",
    "ai.speech.to.text",
    "ai.text.to.speech",
  ],

  GENERATE_TEXT: ["ai.text.generate"],
  REASONING: ["ai.reasoning.execute"],
  GENERATE_IMAGE: ["ai.image.generate"],
  IMAGE_ANALYSIS: ["ai.image.analyze"],
  UPSCALE_IMAGE: ["ai.image.upscale"],
  GENERATE_VIDEO: ["ai.video.generate"],
  UPSCALE_VIDEO: ["ai.video.upscale"],
  LIPSYNC: ["ai.video.lipsync"],
  GENERATE_VOICE: ["ai.voice.generate"],
  SPEECH_TO_TEXT: ["ai.speech.to.text"],
  TEXT_TO_SPEECH: ["ai.text.to.speech"],
  GENERATE_MUSIC: ["ai.music.generate"],
  TRANSLATE: ["ai.translate"],
  EMBEDDINGS: ["ai.embeddings.create"],
  MODERATION: ["ai.moderation.execute"],

  OCR: [
    "document.ocr",
    "document.classify",
  ],

  TRANSLATION: ["ai.translate"],
  FACEBOOK: ["marketing.facebook.publish"],
  INSTAGRAM: ["marketing.instagram.publish"],
  META_ADS: ["marketing.ads.manage"],
  GOOGLE_BUSINESS: ["marketing.google.business.publish"],
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
