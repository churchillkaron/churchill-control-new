import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeProductionControlRuntime,
} from "@/lib/creative/production/control/CreativeProductionControlRuntime";

import {
  CreativeProductionLifecycleRuntime,
  CREATIVE_PRODUCTION_STATUS,
} from "./CreativeProductionLifecycleRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function now() {
  return new Date().toISOString();
}

export const CreativeProductionHandoffRuntime = {
  async activate({
    organization_id,
    creative_project_id,
    approved_by = null,
    approval_source = "USER_APPROVED_PRODUCTION_PLAN",
    production = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const project = await CreativeProjectRuntime.get(creative_project_id);

    if (project.organization_id !== organization_id) {
      throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
    }

    const control = await CreativeProductionControlRuntime.snapshot({
      organization_id,
      creative_project_id,
    });
    const approvalRequired =
      control.budget?.execution_allowed === false;
    const lifecycle = await CreativeProductionLifecycleRuntime.persist({
      organization_id,
      creative_project_id,
      control,
      production_result: production,
      explicit_status: approvalRequired
        ? CREATIVE_PRODUCTION_STATUS.APPROVAL_REQUIRED
        : null,
    });
    const activatedAt = now();

    const updated = await CreativeProjectRuntime.update(
      creative_project_id,
      {
        metadata: {
          ...object(project.metadata),
          autonomous_execution: {
            ...object(project.metadata?.autonomous_execution),
            enabled: true,
            status: approvalRequired
              ? "WAITING_FOR_BUDGET_APPROVAL"
              : "ACTIVE",
            approval_required: approvalRequired,
            approved_by: approved_by || "AUTHENTICATED_USER",
            approved_at: activatedAt,
            approval_source,
            execution_plan_id:
              production.execution_plan_id ||
              project.metadata?.autonomous_execution?.execution_plan_id ||
              null,
            tasks_materialized:
              Number(production.tasks_materialized || 0),
            kickoff: {
              accepted: true,
              submissions: Number(production.submissions || 0),
              polls: Number(production.polls || 0),
              cycles: Number(production.cycles || 0),
              recorded_at: activatedAt,
            },
            continuation: {
              mode: "VERCEL_CRON_DURABLE_QUEUE",
              endpoint: "/api/creative/worker/autonomous",
              schedule: "EVERY_MINUTE",
              requires_manual_continue: false,
            },
            updated_at: activatedAt,
          },
        },
      },
    );

    return {
      success: true,
      autonomous: true,
      approval_required: approvalRequired,
      requires_manual_continue: false,
      lifecycle,
      project: updated,
      continuation: {
        mode: "VERCEL_CRON_DURABLE_QUEUE",
        endpoint: "/api/creative/worker/autonomous",
        schedule: "EVERY_MINUTE",
      },
    };
  },
};
