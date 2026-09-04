const APP_NAME = "avantiqo-intelligence-owned";
const DIRECT_JOB_PREFIX = "modal-intelligence-direct:";
const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1";
const INFRASTRUCTURE_PROVIDER = "MODAL_H100_ASYNC_V1";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const LANES = new Set(["fast", "deep"]);
const CAPABILITY_DEFAULT_LANE = Object.freeze({
  "ai.reasoning.execute": "deep",
  "ai.text.generate": "fast",
});
const PRIVATE_KEYS = new Set([
  "reasoning", "reasoning_content", "chain_of_thought", "chainofthought",
  "cot", "thoughts", "scratchpad", "analysis",
]);

let sdkPromise = null;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function disabled(value) { return ["0", "false", "no", "off"].includes(text(value).toLowerCase()); }
function clean(value, depth = 0) {
  if (value === undefined) return undefined;
  if (depth > 10) return "[depth-limited]";
  if (Array.isArray(value)) {
    return value
      .map((entry) => clean(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, child]) => child !== undefined && !PRIVATE_KEYS.has(String(key).toLowerCase()))
    .map(([key, child]) => [key, clean(child, depth + 1)])
    .filter(([, child]) => child !== undefined));
}

export function intelligenceModalDirectConfigured() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId && !tokenSecret) return false;
  if (!tokenId) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_TOKEN_ID_REQUIRED");
  if (!tokenSecret) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_TOKEN_SECRET_REQUIRED");
  return true;
}

function config() {
  if (!intelligenceModalDirectConfigured()) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_CONFIGURATION_REQUIRED");
  }
  if (text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED) && disabled(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_ENGINE_DISABLED");
  }
  return {
    tokenId: text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID),
    tokenSecret: text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET),
    environment: text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT),
  };
}

async function modalSdk() {
  if (!sdkPromise) sdkPromise = import("modal");
  return sdkPromise;
}

async function clientFor(configValue) {
  const sdk = await modalSdk();
  return {
    sdk,
    client: new sdk.ModalClient({ tokenId: configValue.tokenId, tokenSecret: configValue.tokenSecret }),
  };
}

function executionLane(input = {}) {
  const explicit = text(input.execution_lane || input.executionLane).toLowerCase();
  const capabilityLane = CAPABILITY_DEFAULT_LANE[text(input.capability).toLowerCase()];
  const lane = explicit || capabilityLane || "deep";
  if (!LANES.has(lane)) throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID:${lane}`);
  return lane;
}

function modelForLane(lane) {
  return lane === "fast" ? FAST_MODEL : DEEP_MODEL;
}

function governedContext(input = {}) {
  const context = object(input.context);
  const organizationId = text(context.organization_id);
  const organizationServiceId = text(context.organization_service_id);
  const usageId = text(context.usage_id);
  if (!organizationId || !organizationServiceId || !usageId) {
    throw new Error("AVANTIQO_INTELLIGENCE_GOVERNED_CONTEXT_REQUIRED");
  }
  return { organizationId, organizationServiceId, usageId };
}

export function buildIntelligenceModalDirectPayload(input = {}, context = {}, lane = "deep") {
  if (!LANES.has(lane)) throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID:${lane}`);
  const tools = Array.isArray(input.tools) && input.tools.length > 0 ? input.tools : null;
  const toolChoice = tools ? (input.tool_choice || input.toolChoice) : undefined;
  const payload = clean({
    engine_contract: ENGINE_CONTRACT,
    execution_lane: lane,
    capability: text(input.capability),
    model: modelForLane(lane),
    organization_id: context.organizationId,
    usage_id: context.usageId,
    messages: input.messages,
    system_prompt: input.system_prompt || input.systemPrompt || input.instructions_text,
    prompt: input.prompt || input.input || input.text,
    temperature: input.temperature,
    top_p: input.top_p ?? input.topP,
    max_output_tokens: input.max_output_tokens || input.maxOutputTokens,
    ...(tools ? { tools } : {}),
    ...(tools && toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
    response_format: input.response_format || input.responseFormat,
  });
  if (!tools && (
    Object.prototype.hasOwnProperty.call(payload, "tools") ||
    Object.prototype.hasOwnProperty.call(payload, "tool_choice")
  )) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TEXT_ONLY_TOOL_FIELDS_FORBIDDEN");
  }
  return payload;
}

function isZeroPollTimeout(error, sdk) {
  return error instanceof sdk.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message));
}

function validateCompletedOutput(value) {
  const output = clean(value);
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_OUTPUT_OBJECT_REQUIRED");
  }
  if (text(output.status) !== "completed") {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_COMPLETED_STATUS_REQUIRED");
  }
  if (text(output.provider) !== "avantiqo-intelligence") {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_PROVIDER_INVALID");
  }
  if (text(output.engine_contract) !== ENGINE_CONTRACT) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_ENGINE_CONTRACT_INVALID");
  }
  const lane = text(output.execution_lane).toLowerCase();
  if (!LANES.has(lane)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_DIRECT_LANE_INVALID:${lane || "EMPTY"}`);
  }
  if (text(output.model) !== modelForLane(lane)) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_MODEL_INVALID");
  }
  if (text(output.infrastructure_provider) !== INFRASTRUCTURE_PROVIDER) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_INFRASTRUCTURE_INVALID");
  }
  if (text(output.modal_gpu) !== "H100") {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_H100_REQUIRED");
  }
  if (output.modal_volume_created !== false) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_VOLUME_BOUNDARY_INVALID");
  }
  if (output.raw_reasoning_persisted !== false) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_REASONING_BOUNDARY_INVALID");
  }
  return output;
}

function directMetadata(functionName = null) {
  return {
    infrastructure_provider: INFRASTRUCTURE_PROVIDER,
    modal_gpu: "H100",
    modal_transport: DIRECT_TRANSPORT,
    modal_app: APP_NAME,
    ...(functionName ? { modal_function: functionName } : {}),
    modal_gateway_used: false,
    modal_volume_created: false,
    raw_reasoning_persisted: false,
  };
}

export async function getIntelligenceModalDirectHealth() {
  const cfg = config();
  const started = Date.now();
  const { client } = await clientFor(cfg);
  const lookupOptions = cfg.environment ? { environment: cfg.environment } : {};
  await Promise.all([
    client.functions.fromName(APP_NAME, "fast", lookupOptions),
    client.functions.fromName(APP_NAME, "deep", lookupOptions),
  ]);
  return {
    success: true,
    latency_ms: Date.now() - started,
    ...directMetadata(),
    modal_functions: ["fast", "deep"],
    scale_to_zero: true,
    gpu_inference_performed: false,
  };
}

export async function executeIntelligenceModalDirect(input = {}) {
  const cfg = config();
  const context = governedContext(input);
  const lane = executionLane(input);
  const model = modelForLane(lane);
  const payload = buildIntelligenceModalDirectPayload(input, context, lane);
  const { client } = await clientFor(cfg);
  const lookupOptions = cfg.environment ? { environment: cfg.environment } : {};
  const worker = await client.functions.fromName(APP_NAME, lane, lookupOptions);
  const call = await worker.spawn([payload]);
  const callId = text(call.functionCallId);
  if (!callId) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_CALL_ID_REQUIRED");
  return {
    success: true,
    provider: "avantiqo-intelligence",
    model,
    output: {
      provider_job_id: `${DIRECT_JOB_PREFIX}${callId}`,
      status: "queued",
      engine_contract: ENGINE_CONTRACT,
      execution_lane: lane,
      capability: text(input.capability),
      ...directMetadata(lane),
    },
  };
}

export async function getIntelligenceModalDirectStatus(input = {}) {
  const jobId = text(input.job_id || input.jobId || input.provider_job_id);
  if (!jobId || !jobId.startsWith(DIRECT_JOB_PREFIX)) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_ID_REQUIRED");
  }
  const callId = jobId.slice(DIRECT_JOB_PREFIX.length);
  if (!callId) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_ID_REQUIRED");
  const cfg = config();
  const { sdk, client } = await clientFor(cfg);
  try {
    const call = await client.functionCalls.fromId(callId);
    const raw = await call.get({ timeoutMs: 0 });
    const output = validateCompletedOutput(raw);
    const lane = text(output.execution_lane).toLowerCase();
    const usage = object(output.usage);
    return clean({
      status: "completed",
      provider_job_id: jobId,
      output: {
        ...output,
        ...directMetadata(lane),
      },
      usage: {
        input_tokens: Number(usage.input_tokens || 0),
        output_tokens: Number(usage.output_tokens || 0),
      },
      ...directMetadata(lane),
    });
  } catch (error) {
    if (isZeroPollTimeout(error, sdk)) {
      return {
        status: "processing",
        provider_job_id: jobId,
        ...directMetadata(),
      };
    }
    return clean({
      status: "failed",
      provider_job_id: jobId,
      error: `AVANTIQO_INTELLIGENCE_MODAL_DIRECT_EXECUTION_FAILED:${text(error?.name || "Error")}:${text(error?.message || error).slice(0, 800)}`,
      ...directMetadata(),
    });
  }
}

export function isIntelligenceModalDirectJob(jobId) {
  return text(jobId).startsWith(DIRECT_JOB_PREFIX);
}

export const AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX = DIRECT_JOB_PREFIX;
export const AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TRANSPORT = DIRECT_TRANSPORT;
export const AVANTIQO_INTELLIGENCE_MODAL_APP_NAME = APP_NAME;