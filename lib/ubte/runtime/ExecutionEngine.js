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
import {
  attachMissionBindingState,
  hasMissionBindings,
  observeOperatorMissionBindingResult,
  prepareMissionBindingExecution,
  runMissionBindingExecution,
} from "@/lib/operator/runtime/OperatorMissionBindingExecutionRuntime";
import {
  activeOperatorMissionExecutionId,
  attachOperatorMissionExecutionId,
  resolveOperatorMissionExecutionId,
  runWithOperatorMissionExecutionId,
} from "@/lib/operator/runtime/OperatorMissionExecutionContext";
import {
  claimOperatorMissionDispatch,
  markOperatorMissionStepVerified,
  missionDispatchRecoveryError,
  shouldJournalOperatorMissionDispatch,
  shouldVerifyOperatorMissionDispatch,
  updateOperatorMissionDispatchState,
} from "@/lib/operator/runtime/OperatorMissionDispatchRuntime";

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

function normalizedAuthorizationMode(value) {
  const mode = text(value).toLowerCase();
  return OPERATOR_AUTHORIZATION_MODES.has(mode) ? mode : null;
}

function capabilityKey(domain, capability, action) {
  return [domain, capability, action].map(text).filter(Boolean).join(".");
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

function isMissionChild(metadata = {}) {
  const current = object(metadata);
  return (
    text(current.parentCapabilityKey) === OPERATOR_MISSION_KEY ||
    text(current.source).startsWith("AVANTIQO_OPERATOR_MISSION")
  );
}

function missionResumeMetadata({ metadata, payload, domain, capability, action }) {
  const current = object(metadata);
  if (
    capabilityKey(domain, capability, action) !== OPERATOR_MISSION_KEY ||
    current.operatorMissionResume !== true
  ) {
    return current;
  }

  const resume = object(payload?.resume);
  const stepId = text(resume.current_step_id);
  if (!stepId) return current;

  if (current.operatorMissionConfirmed === true) {
    return {
      ...current,
      operatorAuthorizationMode: "user_confirmed",
      operatorAuthorizationOriginMode: "user_confirmed",
      operatorAuthorizationStepId: stepId,
    };
  }

  if (resume.authorization_server_authoritative !== true) {
    return current;
  }

  const originMode = normalizedAuthorizationMode(
    resume.authorization_origin_mode,
  );
  const storedMode = normalizedAuthorizationMode(resume.authorization_mode);
  if (!originMode) return current;

  return {
    ...current,
    ...(storedMode && storedMode !== "read"
      ? { operatorAuthorizationMode: storedMode }
      : {}),
    operatorAuthorizationOriginMode: originMode,
    operatorAuthorizationStepId: stepId,
  };
}

function normalizedOperatorRuntimeMetadata({
  metadata,
  manifest,
  capability,
  action,
}) {
  const current = object(metadata);
  if (!isOperatorRuntime(current)) return current;

  const explicitMode = normalizedAuthorizationMode(
    current.operatorAuthorizationMode || current.operator_authorization_mode,
  );
  const explicitOrigin = normalizedAuthorizationMode(
    current.operatorAuthorizationOriginMode ||
      current.operator_authorization_origin_mode,
  );
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
  const authorizationStepId = text(current.operatorAuthorizationStepId);
  const missionStepId = text(current.missionStepId);
  const scopedMissionAuthorization =
    missionChild &&
    Boolean(authorizationStepId) &&
    authorizationStepId === missionStepId;

  let authorizationMode = explicitMode;

  if (mode === "read") {
    authorizationMode = "read";
  } else if (missionChild) {
    if (
      scopedMissionAuthorization &&
      explicitOrigin &&
      !["read", "approval_resumed"].includes(explicitOrigin)
    ) {
      authorizationMode = explicitOrigin;
    } else if (current.missionStepConfirmed === true) {
      authorizationMode = "user_confirmed";
    } else if (autoExecute && !requiresConfirmation) {
      authorizationMode = "auto_execute";
    } else {
      authorizationMode = "mission_governed";
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

  const originMode =
    mode === "read"
      ? "read"
      : missionChild
        ? scopedMissionAuthorization && explicitOrigin
          ? explicitOrigin
          : authorizationMode === "approval_resumed"
            ? "unresolved"
            : authorizationMode
        : explicitOrigin ||
          (authorizationMode === "approval_resumed"
            ? "unresolved"
            : authorizationMode);

  return {
    ...current,
    operatorAuthorizationMode: authorizationMode,
    operatorAuthorizationOriginMode: originMode,
    conversationallyConfirmed: originMode === "user_confirmed",
  };
}

function parseCapabilityKey(value) {
  const parts = text(value).split(".");
  if (parts.length !== 3 || parts.some((part) => !text(part))) return null;
  return {
    domain: parts[0],
    capability: parts[1],
    action: parts[2],
  };
}

async function resolveMissionStepAuthorization({ result, metadata }) {
  if (
    text(result?.mission_mode) !== "durable_registered_sequence" ||
    text(result?.status) !== "paused"
  ) {
    return result;
  }

  const resumePayload = object(result?.resume_payload);
  const resume = object(resumePayload.resume);
  const currentStepId = text(resume.current_step_id || result?.current_step_id);
  const steps = Array.isArray(resumePayload.steps) ? resumePayload.steps : [];
  const currentStep = steps.find((step) => text(step?.id) === currentStepId);
  const target = parseCapabilityKey(currentStep?.capability_key);
  if (!currentStepId || !target) return result;

  const pauseReason = text(result?.pause_reason).toLowerCase();
  const requirement =
    pauseReason === "confirmation"
      ? "user_confirmation"
      : pauseReason === "approval"
        ? "durable_approval"
        : pauseReason === "verification"
          ? "verification"
          : "mission_gate";

  let originMode = null;
  let authorizationMode = null;

  if (pauseReason !== "confirmation") {
    const runtimeStepId = text(metadata?.operatorAuthorizationStepId);
    const runtimeOrigin = normalizedAuthorizationMode(
      metadata?.operatorAuthorizationOriginMode,
    );
    if (runtimeStepId === currentStepId && runtimeOrigin && runtimeOrigin !== "read") {
      originMode = runtimeOrigin;
    }

    if (!originMode) {
      try {
        const loaded = await loadCapability(target);
        const mode = operatorMode(
          loaded.manifest || {},
          target.capability,
          target.action,
        );
        const autoExecute = operatorAutoExecute(loaded.manifest || {}, mode);
        const requiresConfirmation = operatorRequiresConfirmation(
          loaded.manifest || {},
          mode,
          autoExecute,
        );

        originMode =
          mode === "read"
            ? "read"
            : requiresConfirmation
              ? "user_confirmed"
              : autoExecute
                ? "auto_execute"
                : "mission_governed";
      } catch {
        originMode = "unresolved";
      }
    }

    authorizationMode =
      pauseReason === "verification" ? "read" : originMode;
  }

  const authorizationState = {
    authorization_requirement: requirement,
    authorization_mode: authorizationMode,
    authorization_origin_mode: originMode,
    authorization_step_id: currentStepId,
    authorization_server_authoritative: true,
  };

  result.resume_payload = {
    ...resumePayload,
    resume: {
      ...resume,
      ...authorizationState,
    },
  };
  result.mission_state = {
    ...object(result.mission_state),
    ...authorizationState,
  };

  return result;
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

  const executionCapabilityKey = capabilityKey(domain, capability, action);
  const missionRoot = executionCapabilityKey === OPERATOR_MISSION_KEY;
  const inheritedMissionExecutionId = activeOperatorMissionExecutionId();
  const missionExecutionId = missionRoot
    ? resolveOperatorMissionExecutionId(payload)
    : inheritedMissionExecutionId;

  const runtimeObject = object(runtime);
  const resumeAwareMetadata = missionResumeMetadata({
    metadata: runtimeObject.metadata,
    payload,
    domain,
    capability,
    action,
  });
  let normalizedMetadata = normalizedOperatorRuntimeMetadata({
    metadata: resumeAwareMetadata,
    manifest: loaded.manifest || {},
    capability,
    action,
  });
  if (missionExecutionId && isMissionChild(normalizedMetadata)) {
    normalizedMetadata = {
      ...normalizedMetadata,
      operatorMissionExecutionId:
        text(normalizedMetadata.operatorMissionExecutionId) || missionExecutionId,
    };
  }

  const missionBindingEnabled = missionRoot && hasMissionBindings(payload);
  let missionBindingPrepared = null;
  let executionPayload = payload;
  if (missionBindingEnabled) {
    missionBindingPrepared = await prepareMissionBindingExecution({
      payload,
      context: { metadata: normalizedMetadata },
    });
    executionPayload = missionBindingPrepared.payload;
  }
  if (isOperatorRuntime(normalizedMetadata)) {
    stampOperatorAuthorizationEvidence(executionPayload, {
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
      payload: executionPayload,
    });

    await runAuthorization({
      capabilityModule:
        loaded.module,
      context,
      payload: executionPayload,
    });

    transaction =
      await beginTransaction({
        context,
        domain,
        capability,
        action,
      });

    const mode = operatorMode(loaded.manifest || {}, capability, action);
    let dispatchClaim = null;

    const invokeLoadedCapability = () =>
      loaded.execute({
        context,
        payload: executionPayload,
      });

    const executeLoadedCapability = async () => {
      if (
        shouldJournalOperatorMissionDispatch({
          mode,
          metadata: normalizedMetadata,
        })
      ) {
        dispatchClaim = await claimOperatorMissionDispatch({
          organizationId,
          missionExecutionId: normalizedMetadata.operatorMissionExecutionId,
          missionStepId: normalizedMetadata.missionStepId,
          capabilityKey: executionCapabilityKey,
          payload: executionPayload,
          metadata: {
            request_id: context.requestId,
            correlation_id: context.correlationId,
          },
        });
        if (dispatchClaim.recovery_only) {
          throw missionDispatchRecoveryError(dispatchClaim);
        }
      }

      try {
        const result = missionRoot
          ? await runWithOperatorMissionExecutionId(
              missionExecutionId,
              invokeLoadedCapability,
            )
          : await invokeLoadedCapability();

        if (dispatchClaim?.claimed) {
          await updateOperatorMissionDispatchState({
            organizationId,
            dispatchKey: dispatchClaim.dispatch_key,
            state: "dispatched",
          });
        }

        if (
          shouldVerifyOperatorMissionDispatch({
            mode,
            metadata: normalizedMetadata,
          })
        ) {
          await markOperatorMissionStepVerified({
            organizationId,
            missionExecutionId: normalizedMetadata.operatorMissionExecutionId,
            missionStepId: normalizedMetadata.missionStepId,
          });
        }

        return result;
      } catch (error) {
        if (dispatchClaim?.claimed) {
          try {
            await updateOperatorMissionDispatchState({
              organizationId,
              dispatchKey: dispatchClaim.dispatch_key,
              state: "uncertain",
              error: text(error?.message || error),
            });
          } catch (journalError) {
            console.error("OPERATOR_MISSION_DISPATCH_STATE_UPDATE_FAILED", {
              dispatch_key: dispatchClaim.dispatch_key,
              error: journalError?.message || journalError,
            });
          }
        }
        throw error;
      }
    };

    let result = missionBindingPrepared
      ? await runMissionBindingExecution(
          missionBindingPrepared,
          executeLoadedCapability,
        )
      : await executeLoadedCapability();

    if (missionRoot) {
      result = await resolveMissionStepAuthorization({
        result,
        metadata: normalizedMetadata,
      });
      if (missionBindingPrepared) {
        result = attachMissionBindingState(result, missionBindingPrepared);
      }
      result = attachOperatorMissionExecutionId(result, missionExecutionId);
    }

    await observeOperatorMissionBindingResult({
      metadata: normalizedMetadata,
      mode,
      result,
    });

    await publishEvents({
      capabilityModule:
        loaded.module,
      context,
      payload: executionPayload,
      result,
    });

    await runAIHooks({
      capabilityModule:
        loaded.module,
      context,
      payload: executionPayload,
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