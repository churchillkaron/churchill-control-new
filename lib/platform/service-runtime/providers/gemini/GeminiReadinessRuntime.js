import "./ManagedGeminiCredentialRegistration.js";

import {
  resolveProviderCredential,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-omni-flash-preview";
const CONTRACT = "GEMINI_ZERO_SPEND_READINESS_V1";

function text(value) {
  return String(value ?? "").trim();
}

function safeError(result = {}, status = null) {
  return text(
    result?.error?.message ||
    result?.message ||
    result?.error ||
    (status ? `Gemini readiness failed with status ${status}` : ""),
  ) || "Gemini readiness failed";
}

async function modelMetadata(apiKey) {
  const response = await fetch(
    `${API_BASE}/models/${encodeURIComponent(MODEL)}`,
    {
      method: "GET",
      redirect: "error",
      headers: {
        "x-goog-api-key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }
  }

  if (!response.ok) {
    throw new Error(
      `GEMINI_READINESS_FAILED:${response.status}:${safeError(result, response.status)}`,
    );
  }

  return result;
}

export async function checkGeminiReadiness({ organization_id } = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const credential = await resolveProviderCredential({
    organization_id,
    provider: "gemini",
  });

  const apiKey = text(credential?.api_key);
  if (!apiKey) {
    throw new Error("GEMINI_MANAGED_CREDENTIAL_UNAVAILABLE");
  }

  const model = await modelMetadata(apiKey);
  const returnedName = text(model?.name);
  const expectedName = `models/${MODEL}`;
  if (returnedName !== expectedName) {
    throw new Error("GEMINI_READINESS_MODEL_MISMATCH");
  }

  return {
    success: true,
    ready: true,
    contract: CONTRACT,
    provider: "gemini",
    model: MODEL,
    model_resource: returnedName,
    display_name: text(model?.displayName) || null,
    supported_generation_methods: Array.isArray(model?.supportedGenerationMethods)
      ? model.supportedGenerationMethods
      : [],
    credential_resolved: true,
    generation_requested: false,
    media_generated: false,
    wallet_used: false,
    billable_generation_authorized: false,
    secret_exposed: false,
    checked_at: new Date().toISOString(),
  };
}

export const GeminiReadinessRuntime = Object.freeze({
  check: checkGeminiReadiness,
});
