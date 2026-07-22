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
    "ai.video.image_to_video",
    "ai.video.lipsync",
  ],
  VOICE_AI: [
    "ai.voice.generate",
    "ai.music.generate",
    "ai.sfx.generate",
    "ai.speech.to.text",
  ],
  OCR: [
    "document.ocr",
    "document.classify",
  ],
  TRANSLATION: [
    "ai.translate",
  ],
  FACEBOOK: [
    "marketing.facebook.publish",
  ],
  INSTAGRAM: [
    "marketing.instagram.publish",
  ],
  GOOGLE_BUSINESS: [
    "marketing.google.business.publish",
  ],
  WHATSAPP: [
    "communication.whatsapp.send",
  ],
  LINE: [
    "communication.line.send",
  ],
};

function isCanonicalExecutionCapability(value) {
  return (
    typeof value === "string" &&
    value.includes(".")
  );
}

export function resolveExecutionCapabilities(
  businessCapabilities = [],
) {
  return businessCapabilities.flatMap((capability) => {
    if (isCanonicalExecutionCapability(capability)) {
      return [capability];
    }

    return (
      CAPABILITY_EXECUTION_MAP[capability] ||
      []
    );
  });
}

export function resolvePrimaryExecutionCapability(
  businessCapabilities = [],
) {
  return (
    resolveExecutionCapabilities(
      businessCapabilities,
    )[0] ||
    null
  );
}
