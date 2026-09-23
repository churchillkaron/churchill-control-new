const PRODUCT = "business_partner";
const LIVE_MODEL = "qwen3:1.7b";
const DEEP_MODEL = "qwen3:4b-instruct";
const LIVE_DISPLAY_MODEL = "Qwen/Qwen3-1.7B-GGUF";

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

const FRONT_MODES = new Set([
  "conversation",
  "conversation_light",
  "semantic_classifier",
  "semantic_light_parallel",
  "structured_action",
  "pending_action_relation",
  "pending_action_presentation",
]);

export function resolveBusinessPartnerIntelligencePolicy(input = {}, executionLane = "fast") {
  const explicitProduct = text(input.intelligence_product || input.intelligenceProduct);
  const moduleName = text(input.metadata?.module);
  const taskMode = text(input.front_task_mode || input.frontTaskMode);
  const isBusinessPartner =
    explicitProduct === PRODUCT ||
    moduleName === "operator" ||
    FRONT_MODES.has(taskMode);

  if (!isBusinessPartner) return null;

  const live = executionLane === "front" && FRONT_MODES.has(taskMode);
  return {
    product: PRODUCT,
    contract: live ? "business.conversation.live" : (executionLane === "deep" ? "business.reasoning.deep" : "business.reasoning.fast"),
    runtime_model: live ? LIVE_MODEL : DEEP_MODEL,
    display_model: live ? LIVE_DISPLAY_MODEL : DEEP_MODEL,
    interactive_code: false,
  };
}

export default resolveBusinessPartnerIntelligencePolicy;
