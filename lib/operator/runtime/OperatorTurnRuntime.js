import {
  execute as executeUbteCapability,
} from "@/lib/ubte/runtime/ExecutionEngine";
import {
  listOperatorCapabilities,
} from "./OperatorCapabilityCatalog";
import {
  listOperatorNavigationTargets,
  resolveOperatorCurrentScreen,
} from "./OperatorNavigationCatalog";
import {
  reasonAboutOperatorTurn,
} from "./OperatorReasoningRuntime";
import {
  verifyOperatorExecution,
} from "./OperatorVerificationRuntime";
import {
  isFastConversationTurn,
  runFastConversationTurn,
} from "./OperatorFastConversationRuntime";

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizePermission(value) {
  return text(value).toLowerCase();
}

function normalizeRole(value) {
  return text(value).toUpperCase();
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const needed = normalizePermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) {
    return needed.startsWith(actual.slice(0, -1));
  }
  return false;
}

function canUseCapability(capability, permissions = [], role = null) {
  if (FULL_ACCESS_ROLES.has(normalizeRole(role))) return true;

  const required = Array.isArray(capability?.permissions)
    ? capability.permissions.filter(Boolean)
    : [];

  if (!required.length) {
    return capability?.mode === "read";
  }

  return required.every((permission) =>
    permissions.some((granted) => permissionMatches(granted, permission)),
  );
}

function safeCapabilities(capabilities, permissions, role) {
  return capabilities.filter((capability) =>
    canUseCapability(capability, permissions, role),
  );
}

function executionBlockedReason(capability) {
  if (!capability) return "CAPABILITY_NOT_AVAILABLE";
  if (capability.requires_confirmation) return "CONFIRMATION_REQUIRED";
  if (!capability.auto_execute) return "AUTOMATIC_EXECUTION_NOT_ENABLED";
  return null;
}

function normalizedExecutionPayload({
  payload,
  organizationId,
  entityId,
  periodId,
  partyId,
}) {
  return {
    ...(payload && typeof payload === "object" ? payload : {}),
    organizationId,
    organization_id: organizationId,
    entityId,
    entity_id: entityId,
    periodId,
    period_id: periodId,
    partyId,
    party_id: partyId,
  };
}

export async function runOperatorTurn({
  organizationId,
  entityId = null,
  periodId = null,
  partyId,
  actor,
  role = null,
  permissions = [],
  locale = null,
  timezone = null,
  message,
  source = "text",
  pathname = null,
  agreementState = {},
  conversation = [],
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");
  if (!text(message)) throw new Error("OPERATOR_MESSAGE_REQUIRED");

  if (isFastConversationTurn({ message, source })) {
    return runFastConversationTurn({
      organizationId,
      partyId,
      entityId,
      locale,
      message,
      conversation,
    });
  }

  const navigationTargets = listOperatorNavigationTargets({ organizationId });
  const currentScreen = resolveOperatorCurrentScreen({
    organizationId,
    pathname,
  });
  const discoveredCapabilities = await listOperatorCapabilities();
  const capabilities = safeCapabilities(
    discoveredCapabilities,
    Array.isArray(permissions) ? permissions : [],
    role,
  );

  const reasoning = await reasonAboutOperatorTurn({
    organizationId,
    partyId,
    entityId,
    locale,
    timezone,
    message,
    source,
    currentScreen,
    agreementState,
    conversation,
    navigationTargets,
    capabilities,
  });

  const decision = reasoning.decision;
  const response = {
    success: true,
    decision,
    agreement_state: decision.agreement_state,
    current_screen: currentScreen,
    provider_evidence: reasoning.provider_evidence,
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: navigationTargets.length,
      executable_capability_count: capabilities.length,
    },
  };

  if (decision.intent === "navigate" && decision.navigation.target_id) {
    const target = navigationTargets.find(
      (item) => item.id === decision.navigation.target_id,
    );

    if (!target) {
      return {
        ...response,
        decision: {
          ...decision,
          intent: "clarify",
          response_text:
            "I understood that you want me to open something, but I could not match it to a registered Avantiqo workspace yet.",
          clarification: {
            required: true,
            question: "Which workspace do you want me to open?",
            options: [],
          },
        },
      };
    }

    response.navigation = {
      target_id: target.id,
      name: target.name,
      href: target.href,
      route: target.route,
    };

    return response;
  }

  if (decision.intent !== "execute" || !decision.execution.capability_key) {
    return response;
  }

  const capability = capabilities.find(
    (item) => item.key === decision.execution.capability_key,
  );
  const blocked = executionBlockedReason(capability);

  if (blocked) {
    return {
      ...response,
      execution: {
        status: "blocked",
        reason: blocked,
        capability: capability || null,
        requested_payload: decision.execution.payload,
      },
      decision: {
        ...decision,
        intent: capability ? "plan" : "clarify",
        response_text:
          capability?.requires_confirmation
            ? `${decision.response_text} I have prepared the action, but secure confirmation is required before execution.`
            : capability
              ? `${decision.response_text} This capability is connected, but automatic execution is not enabled for it yet.`
              : `${decision.response_text} I could not match that action to an Operator-enabled business capability.`,
        clarification: {
          required: !capability,
          question: !capability
            ? "Do you want me to help refine the request or open the relevant workspace?"
            : null,
          options: [],
        },
      },
    };
  }

  const payload = normalizedExecutionPayload({
    payload: decision.execution.payload,
    organizationId,
    entityId,
    periodId,
    partyId,
  });

  const result = await executeUbteCapability({
    organizationId,
    domain: capability.domain,
    capability: capability.capability,
    action: capability.action,
    payload,
    actor,
    runtime: {
      entityId,
      periodId,
      permissions,
      metadata: {
        source: "AVANTIQO_OPERATOR",
        partyId,
        operatorCapabilityKey: capability.key,
      },
    },
  });

  let verifiedDecision = decision;
  let verificationEvidence = null;

  try {
    const verification = await verifyOperatorExecution({
      organizationId,
      partyId,
      entityId,
      locale,
      timezone,
      originalMessage: message,
      source,
      currentScreen,
      agreementState: decision.agreement_state,
      conversation,
      capability,
      result,
    });

    verifiedDecision = verification.decision;
    verificationEvidence = verification.provider_evidence;
  } catch (verificationError) {
    console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
  }

  return {
    ...response,
    agreement_state:
      verifiedDecision.agreement_state ||
      decision.agreement_state,
    provider_evidence: {
      planning: reasoning.provider_evidence,
      verification: verificationEvidence,
    },
    execution: {
      status: "completed",
      capability: {
        key: capability.key,
        domain: capability.domain,
        capability: capability.capability,
        action: capability.action,
        mode: capability.mode,
      },
      result,
    },
    decision: {
      ...verifiedDecision,
      response_text:
        verifiedDecision.response_text ||
        "Done. The requested Avantiqo action completed successfully.",
    },
  };
}
