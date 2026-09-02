import { AsyncLocalStorage } from "node:async_hooks";

export const CODE_AI_INTERACTIVE_PREVIEW_CONTEXT_CONTRACT =
  "AVANTIQO_CODE_AI_INTERACTIVE_PREVIEW_CONTEXT_V1";

const storage = new AsyncLocalStorage();

function text(value, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function normalizedContext(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const organizationId = text(source.organization_id || source.organizationId, 200);
  const actorId = text(source.actor_id || source.actorId, 200);
  const executionKey = text(source.execution_key || source.executionKey, 200);
  if (!organizationId || !actorId || !executionKey) {
    throw new Error("CODE_AI_INTERACTIVE_PREVIEW_SCOPE_REQUIRED");
  }
  return Object.freeze({
    contract: CODE_AI_INTERACTIVE_PREVIEW_CONTEXT_CONTRACT,
    authorized: true,
    source: "CODE_STUDIO_SERVER_CONTROLLER",
    organization_id: organizationId,
    actor_id: actorId,
    execution_key: executionKey,
    production_routing_allowed: false,
    external_fallback_allowed: false,
    commit_authority: false,
    deploy_authority: false,
    database_mutation_authority: false,
  });
}

export function codeAIInteractivePreviewContext() {
  return storage.getStore() || null;
}

export async function withCodeAIInteractivePreviewContext(context, callback) {
  if (typeof callback !== "function") {
    throw new Error("CODE_AI_INTERACTIVE_PREVIEW_CALLBACK_REQUIRED");
  }
  return storage.run(normalizedContext(context), callback);
}

export const CodeAIInteractivePreviewContextRuntime = Object.freeze({
  contract: CODE_AI_INTERACTIVE_PREVIEW_CONTEXT_CONTRACT,
  current: codeAIInteractivePreviewContext,
  run: withCodeAIInteractivePreviewContext,
});

export default CodeAIInteractivePreviewContextRuntime;
