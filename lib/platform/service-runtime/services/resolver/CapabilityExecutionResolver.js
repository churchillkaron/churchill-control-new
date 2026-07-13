const CAPABILITY_EXECUTION_MAP = {

  TEXT_AI:[
    "ai.text.generate",
    "ai.reasoning.execute",
  ],

  IMAGE_AI:[
    "ai.image.generate",
    "ai.image.analyze",
    "ai.image.upscale",
  ],

  VIDEO_AI:[
    "ai.video.generate",
  ],

  VOICE_AI:[
    "ai.voice.generate",
  ],

  OCR:[
    "document.ocr",
    "document.classify",
  ],

  TRANSLATION:[
    "ai.translate",
  ],

  FACEBOOK:[
    "marketing.facebook.publish",
  ],

  INSTAGRAM:[
    "marketing.instagram.publish",
  ],

  GOOGLE_BUSINESS:[
    "marketing.google.business.publish",
  ],

  WHATSAPP:[
    "communication.whatsapp.send",
  ],

  LINE:[
    "communication.line.send",
  ],

};



export function resolveExecutionCapabilities(
  businessCapabilities = []
){

  return businessCapabilities.flatMap(
    capability =>
      CAPABILITY_EXECUTION_MAP[
        capability
      ] || []
  );

}



export function resolvePrimaryExecutionCapability(
  businessCapabilities = []
){

  return (
    resolveExecutionCapabilities(
      businessCapabilities
    )[0]
    ||
    null
  );

}
