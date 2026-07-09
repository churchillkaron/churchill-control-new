export const PLATFORM_AI_SERVICES = [

  {
    id: "ai.reasoning.execute",
    name: "AI Reasoning",
    category: "ai",
    requires: [
      "REASONING",
    ],
  },


  {
    id: "ai.text.generate",
    name: "AI Text Generation",
    category: "ai",
    requires: [
      "GENERATE_TEXT",
    ],
  },


  {
    id: "ai.image.generate",
    name: "AI Image Generation",
    category: "ai",
    requires: [
      "GENERATE_IMAGE",
    ],
  },


  {
    id: "ai.video.generate",
    name: "AI Video Generation",
    category: "ai",
    requires: [
      "GENERATE_VIDEO",
    ],
  },


  {
    id: "ai.voice.generate",
    name: "AI Voice Generation",
    category: "ai",
    requires: [
      "GENERATE_VOICE",
    ],
  },


  {
    id: "ai.speech.to.text",
    name: "Speech To Text",
    category: "ai",
    requires: [
      "SPEECH_TO_TEXT",
    ],
  },


  {
    id: "ai.text.to.speech",
    name: "Text To Speech",
    category: "ai",
    requires: [
      "TEXT_TO_SPEECH",
    ],
  },


  {
    id: "ai.music.generate",
    name: "Music Generation",
    category: "ai",
    requires: [
      "GENERATE_MUSIC",
    ],
  },


  {
    id: "ai.translate",
    name: "Translation",
    category: "ai",
    requires: [
      "TRANSLATE",
    ],
  },


  {
    id: "document.ocr",
    name: "Document OCR",
    category: "document",
    requires: [
      "OCR",
    ],
  },


  {
    id: "ai.embeddings.create",
    name: "Embeddings",
    category: "ai",
    requires: [
      "EMBEDDINGS",
    ],
  },


  {
    id: "ai.moderation.execute",
    name: "Moderation",
    category: "ai",
    requires: [
      "MODERATION",
    ],
  },



  {
    id: "ai.image.analyze",
    name: "AI Image Analysis",
    category: "ai",
    requires: [
      "IMAGE_ANALYSIS",
    ],
  },

  {
    id: "ai.image.upscale",
    name: "Image Upscale",
    category: "ai",
    requires: [
      "UPSCALE_IMAGE",
    ],
  },


  {
    id: "ai.video.upscale",
    name: "Video Upscale",
    category: "ai",
    requires: [
      "UPSCALE_VIDEO",
    ],
  },


  {
    id: "ai.video.lipsync",
    name: "Lip Sync",
    category: "ai",
    requires: [
      "LIPSYNC",
    ],
  },

];


export function getPlatformAIService(id) {

  return (
    PLATFORM_AI_SERVICES.find(
      service =>
        service.id === id
    )
    ||
    null
  );

}
