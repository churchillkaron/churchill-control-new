import {
  executeProvider as executeProviderCore,
  getProviderStatus as getProviderStatusCore,
  cancelProvider as cancelProviderCore,
  loadProviderRuntime,
  prepareProviderInputForExecution,
} from "./ProviderExecutorCore.js";

const VISUAL_GENERATION_CAPABILITIES = new Set([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
]);


const LOCAL_ONLY_NON_AI_CAPABILITIES = new Set([
  "document.ocr",
  "document.classify",
  "media.ffmpeg.process",
]);

function localOnlyCapability(capability) {
  const value=String(capability||"").trim().toLowerCase();
  return value.startsWith("ai.") || LOCAL_ONLY_NON_AI_CAPABILITIES.has(value);
}

function assertOwnedLocalProvider(options = {}) {
  const capability=String(options?.capability||"").trim().toLowerCase();
  if (!localOnlyCapability(capability)) return;
  const provider=String(options?.provider||"").trim().toLowerCase();
  if (!provider.startsWith("avantiqo-")) {
    throw new Error(`AVANTIQO_LOCAL_ONLY_PROVIDER_REQUIRED:${capability}:${provider || "MISSING"}`);
  }
}

function assertVisualGenerationMasterUnlocked(options = {}) {
  const capability = String(options?.capability || "").trim().toLowerCase();
  if (!VISUAL_GENERATION_CAPABILITIES.has(capability)) return;
  if (String(process.env.AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED || "").trim() !== "1") {
    throw new Error("STUDIO_VISUAL_GENERATION_MASTER_LOCKED");
  }
}

function attachProviderLatency(value, latencyMs) {
  if (!value || typeof value !== "object") return value;
  Object.defineProperty(value, "__provider_latency_ms", {
    value: Math.max(0, Number(latencyMs) || 0),
    enumerable: false,
    configurable: true,
  });
  return value;
}

function attachProviderErrorContext(error, options, latencyMs) {
  if (error && typeof error === "object") {
    const metadata = {
      __provider_latency_ms: Math.max(0, Number(latencyMs) || 0),
      __provider_id: String(options?.provider || "").trim() || null,
      __provider_capability: String(options?.capability || "").trim() || null,
    };

    for (const [key, value] of Object.entries(metadata)) {
      Object.defineProperty(error, key, {
        value,
        enumerable: false,
        configurable: true,
      });
    }
  }
  return error;
}

export async function executeProvider(options = {}) {
  const startedAt = Date.now();
  try {
    assertOwnedLocalProvider(options);
    assertVisualGenerationMasterUnlocked(options);
    const result = await executeProviderCore(options);
    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorContext(error, options, Date.now() - startedAt);
  }
}

export async function cancelProvider(options = {}) {
  const startedAt = Date.now();
  try {
    assertOwnedLocalProvider(options);
    const result = await cancelProviderCore(options);
    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorContext(error, options, Date.now() - startedAt);
  }
}

export async function getProviderStatus(options = {}) {
  const startedAt = Date.now();
  try {
    assertOwnedLocalProvider(options);
    const result = await getProviderStatusCore(options);
    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorContext(error, options, Date.now() - startedAt);
  }
}

export {
  loadProviderRuntime,
  prepareProviderInputForExecution,
};

export const ProviderExecutor = {
  executeProvider,
  getProviderStatus,
  cancelProvider,
  loadProviderRuntime,
  prepareProviderInputForExecution,
};
