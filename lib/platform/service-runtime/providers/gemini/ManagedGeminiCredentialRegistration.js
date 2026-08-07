import {
  registerProviderCredentialResolver,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

import {
  listActiveByProvider,
} from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function enabled(row) {
  const metadata = object(row?.metadata);
  return metadata.enabled !== false && metadata.active !== false;
}

function purpose(row) {
  return text(object(row?.metadata).purpose).toUpperCase();
}

function secretEnvironmentName(reference) {
  const normalized = text(reference);

  if (!normalized.toLowerCase().startsWith("env:")) {
    return null;
  }

  return normalized.slice(4).trim() || null;
}

function managedApiKey(row) {
  const environmentName = secretEnvironmentName(row?.secret_reference);

  if (!environmentName) {
    throw new Error("MANAGED_GEMINI_SECRET_REFERENCE_INVALID");
  }

  const apiKey = text(process.env[environmentName]);

  if (!apiKey) {
    throw new Error(
      `MANAGED_GEMINI_SECRET_UNAVAILABLE:${environmentName}`,
    );
  }

  return apiKey;
}

function isManagedGeminiCredential(row) {
  return (
    enabled(row) &&
    purpose(row) === "AVANTIQO_MANAGED_AI" &&
    text(row?.credential_type).toLowerCase() === "managed_api_key" &&
    Boolean(secretEnvironmentName(row?.secret_reference))
  );
}

registerProviderCredentialResolver(
  "gemini",
  async ({ credential_id = null }) => {
    const rows = await listActiveByProvider("gemini");

    const candidates = rows
      .filter(isManagedGeminiCredential)
      .filter(
        (row) =>
          !credential_id ||
          text(row.id) === text(credential_id),
      )
      .sort((left, right) => {
        const leftPriority =
          Number(object(left.metadata).priority || 0);

        const rightPriority =
          Number(object(right.metadata).priority || 0);

        return rightPriority - leftPriority;
      });

    const selected = candidates[0] || null;

    if (!selected) {
      return null;
    }

    return {
      credential_id: selected.id,
      api_key: managedApiKey(selected),
      managed_by: "AVANTIQO",
      credential_purpose: "AVANTIQO_MANAGED_AI",
      api_family: "GEMINI_API",
    };
  },
);
