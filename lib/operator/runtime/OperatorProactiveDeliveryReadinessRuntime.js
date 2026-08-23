import "@/lib/platform/service-runtime/providers/email/EmailProviderRegistration.js";

import { operatorProactiveDeliveryChannelCatalog } from "@/lib/operator/contracts/OperatorProactiveDeliveryPolicy";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { resolveServiceCapabilities } from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import { resolveExecutionCapabilities } from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { loadProviderRuntime } from "@/lib/platform/service-runtime/providers/ProviderExecutor";
import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { listActiveByProvider } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";

const CREDENTIAL_REQUIREMENTS = Object.freeze({
  email_google: Object.freeze({ purpose: "ORGANIZATION_GOOGLE_MAILBOX" }),
  email_microsoft: Object.freeze({ purpose: "ORGANIZATION_MICROSOFT_MAILBOX" }),
  email_imap: Object.freeze({ purpose: "ORGANIZATION_IMAP_SMTP_MAILBOX" }),
  whatsapp: Object.freeze({ purpose: "ORGANIZATION_WHATSAPP_BUSINESS" }),
  line: Object.freeze({ purpose: "ORGANIZATION_LINE_MESSAGING" }),
});

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function secretReferenceValue(reference) {
  const raw = text(reference, 20000);
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("env:")) return raw;
  const environmentName = raw.slice(4).trim();
  return environmentName ? text(process.env[environmentName], 20000) || null : null;
}

function parsedSecret(reference) {
  const raw = secretReferenceValue(reference);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return object(parsed);
  } catch {
    return { opaque_secret: true };
  }
}

function credentialRowsForOrganization(rows, organizationId, purpose) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const metadata = object(row?.metadata);
      return (
        text(metadata.organization_id) === text(organizationId) &&
        text(metadata.purpose).toUpperCase() === purpose &&
        metadata.enabled !== false
      );
    })
    .sort(
      (a, b) =>
        new Date(b?.updated_at || b?.created_at || 0) -
        new Date(a?.updated_at || a?.created_at || 0),
    );
}

function oauthSecretReady(secret, { clientIdEnv, clientSecretEnv }) {
  if (text(secret.access_token)) return true;
  if (!text(secret.refresh_token)) return false;
  return Boolean(text(process.env[clientIdEnv]) && text(process.env[clientSecretEnv]));
}

function credentialStructureReady(providerId, row) {
  if (!row) return false;
  const metadata = object(row.metadata);
  const secret = parsedSecret(row.secret_reference);
  const opaqueSecret = secret.opaque_secret === true;

  if (providerId === "email_google") {
    return Boolean(
      text(metadata.email) &&
      (opaqueSecret || oauthSecretReady(secret, {
        clientIdEnv: "GOOGLE_CLIENT_ID",
        clientSecretEnv: "GOOGLE_CLIENT_SECRET",
      })),
    );
  }

  if (providerId === "email_microsoft") {
    return Boolean(
      opaqueSecret ||
      oauthSecretReady(secret, {
        clientIdEnv: "MICROSOFT_CLIENT_ID",
        clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
      }),
    );
  }

  if (providerId === "email_imap") {
    if (opaqueSecret) return false;
    const smtp = object(secret.smtp);
    return Boolean(
      text(smtp.host) &&
      text(secret.password) &&
      text(secret.username || metadata.email) &&
      text(metadata.email || secret.email || secret.username),
    );
  }

  if (providerId === "whatsapp") {
    return Boolean(
      secretReferenceValue(row.secret_reference) &&
      text(metadata.phone_number_id),
    );
  }

  if (providerId === "line") {
    return Boolean(
      secretReferenceValue(row.secret_reference) &&
      text(metadata.channel_id),
    );
  }

  return false;
}

async function credentialReadiness({ organizationId, providerId, credentialId = null }) {
  const requirement = CREDENTIAL_REQUIREMENTS[providerId];
  if (!requirement) {
    return {
      credential_required: false,
      credential_configured: true,
      credential_ready: true,
      credential_reason: null,
    };
  }

  const rows = credentialRowsForOrganization(
    await listActiveByProvider(providerId),
    organizationId,
    requirement.purpose,
  );
  const selected = credentialId
    ? rows.find((row) => text(row?.id) === text(credentialId)) || null
    : rows[0] || null;
  const configured = Boolean(selected);
  const ready = configured && credentialStructureReady(providerId, selected);

  return {
    credential_required: true,
    credential_configured: configured,
    credential_ready: ready,
    credential_reason: !configured
      ? "PROVIDER_CREDENTIAL_NOT_CONFIGURED"
      : ready
        ? null
        : "PROVIDER_CREDENTIAL_INCOMPLETE",
  };
}

function failedProviderReadiness({
  providerId,
  reason,
  serviceState = {},
  evaluated = {},
}) {
  return {
    provider_id: providerId,
    provider_selected:
      evaluated.provider_selected === true
        ? false
        : null,
    pricing_ready:
      evaluated.pricing_ready === true
        ? false
        : null,
    runtime_ready:
      evaluated.runtime_ready === true
        ? false
        : null,
    credential_required:
      evaluated.credential_required === true
        ? true
        : null,
    credential_configured:
      evaluated.credential_configured === true
        ? false
        : null,
    credential_ready:
      evaluated.credential_ready === true
        ? false
        : null,
    ready_for_execution: false,
    readiness_reason: reason,
    connectivity_verified: false,
    external_request_performed: false,
    ...serviceState,
  };
}

async function providerReadiness({
  organizationId,
  descriptor,
  organizationService,
  serviceStatusError = null,
  capabilityEnabled,
  providerId,
}) {
  const serviceState = serviceStatusError
    ? {
        organization_service_exists: null,
        active: null,
        usage_enabled: null,
        capability_enabled: capabilityEnabled,
      }
    : organizationService
      ? {
          organization_service_exists: true,
          active: text(organizationService?.status, 80).toUpperCase() === "ACTIVE",
          usage_enabled: organizationService?.usage_enabled !== false,
          capability_enabled: capabilityEnabled,
        }
      : {
          organization_service_exists: false,
          active: null,
          usage_enabled: null,
          capability_enabled: capabilityEnabled,
        };

  if (serviceStatusError) {
    return failedProviderReadiness({
      providerId,
      reason: "ORGANIZATION_SERVICE_STATUS_UNAVAILABLE",
      serviceState,
    });
  }
  if (!organizationService) {
    return failedProviderReadiness({
      providerId,
      reason: "ORGANIZATION_SERVICE_NOT_ENABLED",
      serviceState,
    });
  }
  if (!serviceState.active) {
    return failedProviderReadiness({
      providerId,
      reason: "ORGANIZATION_SERVICE_INACTIVE",
      serviceState,
    });
  }
  if (!serviceState.usage_enabled) {
    return failedProviderReadiness({
      providerId,
      reason: "ORGANIZATION_SERVICE_USAGE_DISABLED",
      serviceState,
    });
  }
  if (!capabilityEnabled) {
    return failedProviderReadiness({
      providerId,
      reason: "SERVICE_CAPABILITY_NOT_ENABLED",
      serviceState,
    });
  }

  let selectedProvider = null;
  try {
    selectedProvider = await resolveProvider({
      organization_id: organizationId,
      capability: descriptor.capability,
      preferredProvider: providerId,
      policy: {
        ...object(organizationService.provider_policy),
        allowed_providers: [providerId],
        preferred_providers: [providerId],
      },
    });
    if (selectedProvider?.provider !== providerId) {
      throw new Error("PREFERRED_PROVIDER_NOT_SELECTED");
    }
  } catch (error) {
    return failedProviderReadiness({
      providerId,
      reason: text(error?.message || error, 300) || "PROVIDER_UNAVAILABLE",
      serviceState,
      evaluated: { provider_selected: true },
    });
  }

  let pricing = null;
  try {
    pricing = PricingRuntime.resolveRecord({
      pricing: selectedProvider.pricing_record,
      provider: selectedProvider.provider,
      model: selectedProvider.model,
      capability: descriptor.capability,
      usage: { quantity: 1 },
    });
  } catch (error) {
    return {
      ...failedProviderReadiness({
        providerId,
        reason: text(error?.message || error, 300) || "PROVIDER_PRICING_UNAVAILABLE",
        serviceState,
        evaluated: { pricing_ready: true },
      }),
      provider_selected: true,
    };
  }

  let runtimeReady = false;
  let runtimeReason = null;
  try {
    await loadProviderRuntime(providerId);
    runtimeReady = true;
  } catch (error) {
    runtimeReason = text(error?.message || error, 300) || "PROVIDER_RUNTIME_UNAVAILABLE";
  }

  let credential = null;
  try {
    credential = await credentialReadiness({
      organizationId,
      providerId,
      credentialId: selectedProvider.credential_id || null,
    });
  } catch (error) {
    credential = {
      credential_required: null,
      credential_configured: null,
      credential_ready: null,
      credential_reason:
        text(error?.message || error, 300) ||
        "PROVIDER_CREDENTIAL_STATUS_UNAVAILABLE",
    };
  }

  const ready = Boolean(
    selectedProvider &&
    pricing &&
    runtimeReady &&
    credential?.credential_ready === true,
  );

  return {
    provider_id: providerId,
    provider_selected: true,
    pricing_ready: true,
    runtime_ready: runtimeReady,
    ...credential,
    ready_for_execution: ready,
    readiness_reason: ready
      ? "STATIC_EXECUTION_PREFLIGHT_READY"
      : runtimeReason ||
        credential?.credential_reason ||
        "PROVIDER_EXECUTION_PREFLIGHT_FAILED",
    pricing: {
      pricing_id: pricing.pricing_id || null,
      currency: pricing.currency || null,
      customer_price: pricing.customer_price ?? null,
      zero_price: pricing.zero_price === true,
    },
    connectivity_verified: false,
    external_request_performed: false,
    ...serviceState,
  };
}

export async function operatorProactiveDeliveryReadiness({ organizationId } = {}) {
  if (!text(organizationId)) throw new Error("organizationId required");

  return Promise.all(
    operatorProactiveDeliveryChannelCatalog().map(async (descriptor) => {
      let organizationService = null;
      let serviceError = null;
      try {
        organizationService = await OrganizationServiceRuntime.get({
          organization_id: organizationId,
          service_id: descriptor.service_id,
        });
      } catch (error) {
        serviceError =
          text(error?.message || error, 300) ||
          "ORGANIZATION_SERVICE_STATUS_UNAVAILABLE";
      }

      const serviceCapabilities = resolveServiceCapabilities(descriptor.service_id);
      const enabledCapabilities = resolveExecutionCapabilities(
        serviceCapabilities?.capabilities || [],
      );
      const capabilityEnabled = enabledCapabilities.includes(descriptor.capability);
      const providers = await Promise.all(
        descriptor.providers.map((providerId) =>
          providerReadiness({
            organizationId,
            descriptor,
            organizationService,
            serviceStatusError: serviceError,
            capabilityEnabled,
            providerId,
          }),
        ),
      );

      return {
        ...descriptor,
        organization_service_exists: serviceError
          ? null
          : Boolean(organizationService),
        active: serviceError
          ? null
          : organizationService
            ? text(organizationService?.status, 80).toUpperCase() === "ACTIVE"
            : null,
        usage_enabled: serviceError
          ? null
          : organizationService
            ? organizationService?.usage_enabled !== false
            : null,
        capability_enabled: capabilityEnabled,
        service_status_error: serviceError,
        ready_for_execution: providers.some(
          (provider) => provider.ready_for_execution === true,
        ),
        providers,
        readiness_contract: "OPERATOR_PROACTIVE_DELIVERY_STATIC_PREFLIGHT_V1",
        connectivity_verified: false,
        external_request_performed: false,
      };
    }),
  );
}
