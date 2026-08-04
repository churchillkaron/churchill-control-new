import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction-exact-resume.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function authorized(name) {
  return text(process.env[name]).toLowerCase() === "true";
}

function requestIdentity(input = {}) {
  const operation = text(input.metadata?.operation).toUpperCase();
  const request = {
    operation,
    prompt:
      input.input?.prompt ||
      input.input?.input ||
      input.input?.messages ||
      "",
    response_format: input.input?.response_format || null,
    max_output_tokens:
      input.input?.max_output_tokens ??
      input.input?.maxOutputTokens ??
      null,
    quantity: input.input?.quantity ?? 1,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
}

function serviceResultFromUsage(usage = {}) {
  const providerResult = object(usage.metadata?.result);
  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult.provider || null,
    model: usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    settlement: "CHARGED",
    exact_resume: true,
    exact_resume_usage_id: usage.id || null,
    output: providerResult,
  };
}

async function recoverExactResult(input = {}, requestHash) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const operation = text(input.metadata?.operation).toUpperCase();

  if (!organizationId || !projectId || !operation) return null;

  const project = await CreativeProjectRuntime.get(projectId);
  if (
    !project ||
    text(project.organization_id) !== organizationId
  ) {
    throw new Error("CREATIVE_DIRECTION_EXACT_RESUME_PROJECT_SCOPE_INVALID");
  }

  const approval = object(project.metadata?.paid_direction_approval);
  const expectedApprovalId = text(
    process.env.CREATIVE_DIRECTION_RESUME_APPROVAL_ID,
  );
  const expectedCommandIdentity = text(
    process.env.CREATIVE_DIRECTION_RESUME_COMMAND_IDENTITY,
  );

  if (
    approval.contract !== "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2" ||
    approval.approved !== true ||
    !["APPROVED", "IN_PROGRESS"].includes(
      text(approval.status).toUpperCase(),
    )
  ) {
    throw new Error("CREATIVE_DIRECTION_EXACT_RESUME_APPROVAL_REQUIRED");
  }

  if (
    expectedApprovalId &&
    text(approval.id) !== expectedApprovalId
  ) {
    throw new Error(
      `CREATIVE_DIRECTION_EXACT_RESUME_APPROVAL_MISMATCH:${text(approval.id)}:${expectedApprovalId}`,
    );
  }

  if (
    expectedCommandIdentity &&
    text(project.metadata?.command_identity) !==
      expectedCommandIdentity
  ) {
    throw new Error(
      "CREATIVE_DIRECTION_EXACT_RESUME_COMMAND_IDENTITY_MISMATCH",
    );
  }

  const approvedAt = Date.parse(text(approval.approved_at));
  const rows = await UsageRuntime.organization(organizationId);
  const candidates = rows
    .filter((row) => text(row.status).toUpperCase() === "SUCCESS")
    .filter((row) => text(row.category).toUpperCase() === "CREATIVE_DIRECTION")
    .filter((row) => text(row.metadata?.creative_project_id) === projectId)
    .filter((row) => text(row.metadata?.operation).toUpperCase() === operation)
    .filter((row) =>
      text(row.metadata?.creative_direction_request_hash) === requestHash,
    )
    .filter((row) => Object.keys(object(row.metadata?.result)).length > 0)
    .filter((row) => {
      if (!expectedApprovalId) return true;
      return text(row.metadata?.direction_approval_id) === expectedApprovalId;
    })
    .filter((row) => {
      if (!Number.isFinite(approvedAt)) return true;
      const createdAt = Date.parse(row.created_at || row.updated_at || 0);
      return Number.isFinite(createdAt) && createdAt >= approvedAt;
    })
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    );

  return candidates[0] || null;
}

export function installCreativeDirectionExactResume() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutExactResume =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithExactResume(input = {}) {
      if (
        text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
        !authorized("CREATIVE_DIRECTION_EXACT_RESUME_AUTHORIZED")
      ) {
        return executeWithoutExactResume(input);
      }

      const operation = text(input.metadata?.operation).toUpperCase();
      if (!operation) {
        throw new Error("CREATIVE_DIRECTION_EXACT_RESUME_OPERATION_REQUIRED");
      }

      const requestHash = requestIdentity(input);
      const recovered = await recoverExactResult(input, requestHash);

      if (recovered) {
        console.log(
          `CREATIVE_DIRECTION_EXACT_RESUME_RECOVERED=${operation}:${recovered.id}`,
        );
        return serviceResultFromUsage(recovered);
      }

      console.log(
        `CREATIVE_DIRECTION_EXACT_RESUME_MISS=${operation}:${requestHash}`,
      );

      return executeWithoutExactResume({
        ...input,
        metadata: {
          ...object(input.metadata),
          creative_direction_exact_resume_authorized: true,
          creative_direction_exact_resume_request_hash: requestHash,
        },
      });
    };
}

installCreativeDirectionExactResume();

export const CreativeDirectionExactResumeRuntime = Object.freeze({
  installed: true,
  requestIdentity,
});
