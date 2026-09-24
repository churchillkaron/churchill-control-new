import { INTELLIGENCE_MODEL_REGISTRY } from "./IntelligenceModelRegistry.js";

const PRODUCT = "code";
const LIVE_MODEL = INTELLIGENCE_MODEL_REGISTRY.live.runtime_model;
const DEEP_MODEL = INTELLIGENCE_MODEL_REGISTRY.deep.runtime_model;
const LIVE_DISPLAY_MODEL = INTELLIGENCE_MODEL_REGISTRY.live.display_model;

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveCodeIntelligencePolicy(input = {}, executionLane = "fast") {
  const explicitProduct = text(input.intelligence_product || input.intelligenceProduct);
  const moduleName = text(input.metadata?.module || input.origin_module);
  const taskMode = text(input.front_task_mode || input.frontTaskMode);
  const isCode =
    explicitProduct === PRODUCT ||
    moduleName.startsWith("code_ai") ||
    taskMode === "code_live_conversation" ||
    taskMode === "code_deep_conversation";

  if (!isCode) return null;

  const live = executionLane === "front" && taskMode === "code_live_conversation";
  return {
    product: PRODUCT,
    contract: live ? "code.conversation.live" : (executionLane === "deep" || taskMode === "code_deep_conversation" ? "code.reasoning.deep" : "code.reasoning.fast"),
    runtime_model: live ? LIVE_MODEL : DEEP_MODEL,
    display_model: live ? LIVE_DISPLAY_MODEL : DEEP_MODEL,
    interactive_code: true,
  };
}

export default resolveCodeIntelligencePolicy;
