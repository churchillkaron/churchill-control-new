import {
  createExecutionContext,
} from "./context/createExecutionContext";

import {
  loadCapability,
} from "./loaders/CapabilityLoader";

import {
  runValidation,
} from "./engines/ValidationEngine";

import {
  runAuthorization,
} from "./engines/AuthorizationEngine";

import {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
} from "./engines/TransactionEngine";

import {
  publishEvents,
} from "./engines/EventEngine";

import {
  runAIHooks,
} from "./engines/AIEngine";

import {
  writeAuditLog,
} from "./engines/AuditEngine";
import {
  stampOperatorAuthorizationEvidence,
} from "@/lib/operator/governance/operatorAuthorizationEvidence";

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";
const OPERATOR_AUTHORIZATION_MODES = new Set([
  "read",
  "auto_execute",
  "user_confirmed",
  "approval_resumed",
  "mission_governed",
  "unresolved",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function operatorMode(manifest = {}, capability, action) {
  const explicit = text(
    manifest.operatorMode || manifest.operator_mode,
  ).toLowerCase();
  if (["read", "draft", "write", "approve", "navigate"].includes(explicit)) {
    return explicit;
  }

  const key = `${capability || ""}.${action || ""}`.toLowerCase();
  if (/^(get|list|read|find|search|view|summarize|analyse|analyze|report)/.test(key)) {
    return "read";
  }
  if (/(approve|post|close|delete|archive|pay|release|refund|reversal|lock|reopen)/.test(key)) {
    return "approve";
  }
  return "write";
}

function operatorRisk(manifest = {}) {
  const risk = text(
    manifest.risk || manifest.riskLevel || manifest.risk_level,
  ).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(risk)
    ? risk
    : "medium";
}

function operatorAutoExecute(manifest = {}, mode) {
  return (
    mode === "read" ||
    manifest.operatorAutoExecute === true ||
    manifest.operator_auto_execute === true
  );
}

function operatorRequiresConfirmation(manifest = {}, mode, autoExecute) {
  return (
    manifest.operatorRequiresConfirmation === true ||
    manifest.operator_requires_confirmation === true ||
    mode === "approve" ||
    ["high", "critical"].includes(operatorRisk(manifest)) ||
    !autoExecute
  );
}

function isOperatorRuntime(metadata = {}) {
  const current = object(metadata);
  const source = text(current.source);
  return (
    source === "AVANTIQO_OPERATOR" ||
    source.startsWith("AVANTIQO_OPERATOR_MISSION") ||
    text(current.parentCapabilityKey) === OPERATOR_MISSION_KEY
  );
}

function normalizedOperatorRuntimeMetadata({
  metadata,
  manifest,
  capability,
  action,
}) {
  const current = object(metadata);
  if (!isOperatorRuntime(current)) return current;

  const explicitMode = text(
    current.operatorAuthorizationMode || current.operator_authorization_mode,
  ).toLowerCase();
  const explicitOrigin = text(
    current.operatorAuthorizationOriginMode ||
      current.operator_authorization_origin_mode,
  ).toLowerCase();
  const mode = operatorMode(manifest, capability, action);
  const autoExecute = operatorAutoExecute(manifest, mode);
  const requiresConfirmation = operatorRequiresConfirmation(
    manifest,
    mode,
    autoExecute,
  );
  const legacyConfirmed = current.conversationallyConfirmed === true;
  const channel = text(current.channel).toLowerCase();
  const missionChild =
    text(current.parentCapabilityKey) === OPERATOR_MISSION_KEY ||
    text(current.source).startsWith("AVANTIQO_OPERATOR_MISSION");

  let authorizationMode = OPERATOR_AUTHORIZATION_MODES.has(explicitMode)
    ? explicitMode
    : null;

  if (mode === "read") {
    authorizationMode = "read";
  } else if (missionChild) {
    if (current.operatorMissionConfirmed === true || current.missionStepConfirmed === true) {
      authorizationMode = "user_confirmed";
    } else if (autoExecute && !requiresConfirmation) {
      authorizationMode = "auto_execute";
    } else {
      authorizationMode = authorizationMode || "mission_governed";
    }
  } else if (!authorizationMode) {
    if (
      legacyConfirmed &&
      (channel === "voice" ||
        requiresConfirmation ||
        current.operatorMissionConfirmed === true)
    ) {
      authorizationMode = "user_confirmed";
    } else if (autoExecute) {
      authorizationMode = "auto_execute";
    } else {
      authorizationMode = "unresolved";
    }
  }

  const originMode = OPERATOR_AUTHORIZATION_MODES.has(explicitOrigin)
    ? explicitOrigin
    : authorizationMode === "approval_resumed"
      ? "unresolved"
      : authorizationMode;

  return {
    ...current,
    operatorAuthorizationMode: authorizationMode,
    operatorAuthorizationOriginMode: originMode,
    conversationallyConfirmed: originMode === "user_confirmed",
  };
}

export async function execute({
  organizationId,
  domain,
  capability,
  action,
  payload = {},
  actor = null,
  runtime = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!domain) {
    throw new Error("domain required");
  }

  if (!capability) {
    throw new Error("capability required");
  }

  if (!action) {
    throw new Error("action required");
  }

  const loaded =
    await loadCapability({
      domain,
      capability,
      action,
    });

  const runtimeObject = object(runtime);
  const normalizedMetadata = normalizedOperatorRuntimeMetadata({
    metadata: runtimeObject.metadata,
    manifest: loaded.manifest || {},
    capability,
    action,
  });
  if (isOperatorRuntime(normalizedMetadata)) {
    stampOperatorAuthorizationEvidence(payload, {
      mode: normalizedMetadata.operatorAuthorizationMode,
      origin_mode: normalizedMetadata.operatorAuthorizationOriginMode,
      approval_resumed: normalizedMetadata.operatorApprovalResumed === true,
    });
  }

  const context =
    createExecutionContext({
      organizationId,
      actor,
      ...runtimeObject,
      metadata: normalizedMetadata,
    });

  let transaction = null;

  try {
    await runValidation({
      capabilityModule:
        loaded.module,
      context,
      payload,
    });

    await runAuthorization({
      capabilityModule:
        loaded.module,
      context,
      payload,
    });

    transaction =
      await beginTransaction({
        context,
        domain,
        capability,
        action,
      });

    const result =
      await loaded.execute({
        context,
        payload,
      });

    await publishEvents({
      capabilityModule:
        loaded.module,
      context,
      payload,
      result,
    });

    await runAIHooks({
      capabilityModule:
        loaded.module,
      context,
      payload,
      result,
    });

    await writeAuditLog({
      context,
      domain,
      capability,
      action,
      result,
    });

    await commitTransaction({
      transaction,
      result,
    });

    return {
      success: true,
      context: {
        organizationId:
          context.organizationId,
        requestId:
          context.requestId,
        correlationId:
          context.correlationId,
      },
      domain,
      capability,
      action,
      result,
    };
  } catch (error) {
    await rollbackTransaction({
      transaction,
      error,
    });

    throw error;
  }
}