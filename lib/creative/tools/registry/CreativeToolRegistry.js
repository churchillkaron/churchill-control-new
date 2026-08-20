import {
  creativeMediaBinaryReadiness,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

export const CREATIVE_TOOL_RUNTIME = Object.freeze({
  LOCAL: "LOCAL",
  SANDBOX: "SANDBOX",
  SERVICE_RUNTIME: "SERVICE_RUNTIME",
});

export const CREATIVE_TOOL_CAPABILITIES = Object.freeze({
  MEDIA_INSPECT: "creative.media.inspect",
  MEDIA_TRANSCODE: "creative.media.transcode",
  MEDIA_EDIT: "creative.media.edit",
  MEDIA_MUX: "creative.media.mux",
  AUDIO_MIX: "creative.audio.mix",
  AUDIO_ANALYSE: "creative.audio.analyse",
  FRAME_EXTRACT: "creative.video.frame.extract",
  IMAGE_FINISH: "creative.image.finish",
  MOTION_COMPOSE: "creative.motion.compose",
  UI_CAPTURE: "creative.ui.capture",
  BROWSER_RECORD: "creative.browser.record",
  VECTOR_RENDER: "creative.vector.render",
  THREE_D_RENDER: "creative.3d.render",
  CAMERA_TRACK: "creative.camera.track",
  OPTICAL_FLOW: "creative.optical-flow.compute",
  SEGMENTATION: "creative.segmentation.execute",
  BACKGROUND_REMOVE: "creative.background.remove",
  UPSCALE: "creative.media.upscale",
  VIDEO_GENERATE: "ai.video.generate",
  IMAGE_GENERATE: "ai.image.generate",
  IMAGE_EDIT: "ai.image.edit",
  VOICE_GENERATE: "ai.voice.generate",
  MUSIC_GENERATE: "ai.music.generate",
  SOUND_EFFECT_GENERATE: "ai.sound-effect.generate",
  LIP_SYNC: "ai.video.lipsync",
  PERCEPTUAL_REVIEW: "ai.image.analyze",
});

const TOOL_DEFINITIONS = Object.freeze([
  {
    id: "ffmpeg",
    label: "FFmpeg",
    runtime: CREATIVE_TOOL_RUNTIME.LOCAL,
    availability: "RUNTIME_DISCOVERED",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.MEDIA_TRANSCODE,
      CREATIVE_TOOL_CAPABILITIES.MEDIA_EDIT,
      CREATIVE_TOOL_CAPABILITIES.MEDIA_MUX,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_MIX,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_ANALYSE,
      CREATIVE_TOOL_CAPABILITIES.FRAME_EXTRACT,
    ],
  },
  {
    id: "ffprobe",
    label: "FFprobe",
    runtime: CREATIVE_TOOL_RUNTIME.LOCAL,
    availability: "RUNTIME_DISCOVERED",
    capabilities: [CREATIVE_TOOL_CAPABILITIES.MEDIA_INSPECT],
  },
  {
    id: "sharp",
    label: "Sharp / libvips",
    runtime: CREATIVE_TOOL_RUNTIME.LOCAL,
    availability: "INSTALLED",
    capabilities: [CREATIVE_TOOL_CAPABILITIES.IMAGE_FINISH],
  },
  {
    id: "remotion",
    label: "Remotion",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    capabilities: [CREATIVE_TOOL_CAPABILITIES.MOTION_COMPOSE],
  },
  {
    id: "chromium-playwright",
    label: "Chromium + Playwright",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.UI_CAPTURE,
      CREATIVE_TOOL_CAPABILITIES.BROWSER_RECORD,
    ],
  },
  {
    id: "blender",
    label: "Blender",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    capabilities: [CREATIVE_TOOL_CAPABILITIES.THREE_D_RENDER],
  },
  {
    id: "opencv",
    label: "OpenCV",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.CAMERA_TRACK,
      CREATIVE_TOOL_CAPABILITIES.OPTICAL_FLOW,
      CREATIVE_TOOL_CAPABILITIES.SEGMENTATION,
    ],
  },
  {
    id: "imagemagick",
    label: "ImageMagick",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.IMAGE_FINISH,
      CREATIVE_TOOL_CAPABILITIES.VECTOR_RENDER,
    ],
  },
  {
    id: "service-runtime",
    label: "Avantiqo Service Runtime",
    runtime: CREATIVE_TOOL_RUNTIME.SERVICE_RUNTIME,
    availability: "GOVERNED",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.VIDEO_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_EDIT,
      CREATIVE_TOOL_CAPABILITIES.VOICE_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.MUSIC_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.SOUND_EFFECT_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.LIP_SYNC,
      CREATIVE_TOOL_CAPABILITIES.BACKGROUND_REMOVE,
      CREATIVE_TOOL_CAPABILITIES.UPSCALE,
      CREATIVE_TOOL_CAPABILITIES.PERCEPTUAL_REVIEW,
    ],
  },
]);

function toolReadiness(tool) {
  if (tool.id !== "ffmpeg" && tool.id !== "ffprobe") {
    return { ...tool };
  }

  const readiness = creativeMediaBinaryReadiness();
  if (tool.id === "ffmpeg") {
    return {
      ...tool,
      available: readiness.ffmpeg_configured,
      source: readiness.ffmpeg_source,
    };
  }
  return {
    ...tool,
    available: readiness.ffprobe_configured,
    source: readiness.ffprobe_source,
  };
}

export function listCreativeTools() {
  return TOOL_DEFINITIONS.map(toolReadiness);
}

export function getCreativeToolsForCapability(capability) {
  return listCreativeTools().filter((tool) =>
    tool.capabilities.includes(capability),
  );
}

export function resolveCreativeTool(capability, { runtime = null } = {}) {
  const candidates = getCreativeToolsForCapability(capability)
    .filter((tool) => !runtime || tool.runtime === runtime)
    .filter((tool) => tool.available !== false);

  return candidates[0] || null;
}

export const CreativeToolRegistry = Object.freeze({
  runtimes: CREATIVE_TOOL_RUNTIME,
  capabilities: CREATIVE_TOOL_CAPABILITIES,
  list: listCreativeTools,
  forCapability: getCreativeToolsForCapability,
  resolve: resolveCreativeTool,
});
