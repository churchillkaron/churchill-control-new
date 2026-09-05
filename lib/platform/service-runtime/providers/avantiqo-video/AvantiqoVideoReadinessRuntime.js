const PROVIDER_ID = "avantiqo-video";
const APP_NAME = "avantiqo-video-owned";
const FUNCTION_NAME = "generate_native_job";
const TRANSPORT = "modal-js-sdk-function-call-v1";

let modalSdkPromise = null;

function text(value) {
  return String(value ?? "").trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

async function modalSdk() {
  if (!modalSdkPromise) modalSdkPromise = import("modal");
  return modalSdkPromise;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function inspectAvantiqoVideoRuntimeReadiness() {
  const base = {
    provider: PROVIDER_ID,
    app: APP_NAME,
    function: FUNCTION_NAME,
    transport: TRANSPORT,
    generation_spawned: false,
    paid_inference_performed: false,
    checked_at: new Date().toISOString(),
  };

  if (!enabled(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED)) {
    return {
      ...base,
      ready: false,
      status: "BLOCKED",
      backlog: 0,
      running: 0,
      error: "AVANTIQO_VIDEO_ENGINE_DISABLED",
    };
  }

  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId || !tokenSecret) {
    return {
      ...base,
      ready: false,
      status: "BLOCKED",
      backlog: 0,
      running: 0,
      error: "AVANTIQO_VIDEO_MODAL_CREDENTIALS_REQUIRED",
    };
  }

  try {
    const sdk = await modalSdk();
    const client = new sdk.ModalClient({ tokenId, tokenSecret });
    const environment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT);
    const lookupOptions = environment ? { environment } : {};
    const worker = await client.functions.fromName(APP_NAME, FUNCTION_NAME, lookupOptions);
    if (typeof worker?.getCurrentStats !== "function") {
      throw new Error("AVANTIQO_VIDEO_MODAL_STATS_REQUIRED");
    }
    const stats = await worker.getCurrentStats();
    const backlog = Math.max(0, number(stats?.backlog));
    const running = Math.max(0, number(stats?.numRunningInputs ?? stats?.num_running_inputs));
    const busy = backlog > 0 || running > 0;

    return {
      ...base,
      ready: !busy,
      status: busy ? "BUSY" : "READY",
      backlog,
      running,
      error: busy ? "AVANTIQO_VIDEO_RUNTIME_BUSY" : null,
    };
  } catch (error) {
    return {
      ...base,
      ready: false,
      status: "BLOCKED",
      backlog: 0,
      running: 0,
      error: error?.message || String(error),
    };
  }
}

export const AvantiqoVideoReadinessRuntime = Object.freeze({
  inspect: inspectAvantiqoVideoRuntimeReadiness,
});
