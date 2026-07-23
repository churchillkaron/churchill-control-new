import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeProductionControlRuntime,
} from "@/lib/creative/production/control/CreativeProductionControlRuntime";

import {
  CreativeAutonomousExecutionRuntime,
} from "@/lib/creative/worker/CreativeAutonomousExecutionRuntime";

import {
  CreativeProductionLifecycleRuntime,
  CREATIVE_PRODUCTION_STATUS,
} from "./CreativeProductionLifecycleRuntime";

import {
  ProductionRuntime,
} from "./ProductionRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function now() {
  return new Date().toISOString();
}

async function recordAutonomousExecution({
  project,
  enabled,
  approval,
  queue = null,
  control = null,
  kickoff = null,
  status,
}) {
  return CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...object(project.metadata),
      autonomous_execution: {
        ...object(project.metadata?.autonomous_execution),
        enabled,
        status,
        approved_by: approval.approved_by,
        approved_at: approval.approved_at,
        approval_source: approval.source,
        execution_plan_id:
          queue?.execution_plan_id ||
          project.metadata?.autonomous_execution?.execution_plan_id ||
          null,
        tasks_materialized:
          queue?.tasks_materialized ??
          project.metadata?.autonomous_execution?.tasks_materialized ??
          0,
        budget_execution_allowed:
          control?.budget?.execution_allowed !== false,
        budget_approval_required:
          control?.budget?.approval_required === true,
        kickoff: kickoff
          ? {
              accepted: kickoff.accepted,
              dispatched: kickoff.dispatched,
              polled: kickoff.polled,
              recovered: kickoff.recovered,
              error: kickoff.error,
              attempted_at: kickoff.attempted_at,
            }
          : project.metadata?.autonomous_execution?.kickoff || null,
        updated_at: now(),
      },
    },
  });
}

export const CreativeProductionHandoffRuntime = {
  async start({
    organization_id,
    creative_project_id,
    approved_by = null,
    approval_source = "USER_APPROVED_PRODUCTION_PLAN",
    initial_dispatches = 1,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const project = await CreativeProjectRuntime.get(creative_project_id);

    if (project.organization_id !== organization_id) {
      throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
    }

    const approval = {
      approved_by: approved_by || "AUTHENTICATED_USER",
      approved_at: now(),
      source: approval_source,
    };

    const queue = await ProductionRuntime.queueProduction({
      organization_id,
      creative_project_id,
    });

    const control = await CreativeProductionControlRuntime.snapshot({
      organization_id,
      creative_project_id,
    });

    if (control.budget?.execution_allowed === false) {
      const lifecycle = await CreativeProductionLifecycleRuntime.persist({
        organization_id,
        creative_project_id,
        control,
        explicit_status:
          CREATIVE_PRODUCTION_STATUS.APPROVAL_REQUIRED,
      });

      await recordAutonomousExecution({
        project: await CreativeProjectRuntime.get(creative_project_id),
        enabled: true,
        approval,
        queue,
        control,
        status: "WAITING_FOR_BUDGET_APPROVAL",
      });

      return {
        success: true,
        queued: true,
        autonomous: true,
        approval_required: true,
        execution_started: false,
        queue,
        control,
        lifecycle,
      };
    }

    await recordAutonomousExecution({
      project: await CreativeProjectRuntime.get(creative_project_id),
      enabled: true,
      approval,
      queue,
      control,
      status: "ACTIVE",
    });

    const attemptedAt = now();
    let kickoff;

    try {
      const result = await CreativeAutonomousExecutionRuntime.runProject({
        organization_id,
        creative_project_id,
        max_dispatches: Math.max(
          1,
          Math.min(Number(initial_dispatches || 1), 2),
        ),
      });

      kickoff = {
        accepted: true,
        dispatched: Number(result.dispatched || 0),
        polled: Number(result.polled || 0),
        recovered: Number(result.recovered || 0),
        error: null,
        attempted_at: attemptedAt,
        result,
      };
    } catch (error) {
      kickoff = {
        accepted: false,
        dispatched: 0,
        polled: 0,
        recovered: 0,
        error: error?.message || String(error),
        attempted_at: attemptedAt,
        result: null,
      };
    }

    const refreshedControl =
      await CreativeProductionControlRuntime.snapshot({
        organization_id,
        creative_project_id,
      });
    const lifecycle = await CreativeProductionLifecycleRuntime.persist({
      organization_id,
      creative_project_id,
      control: refreshedControl,
      production_result: kickoff.result?.finalization || {
        queue: kickoff.result?.queue || null,
      },
    });

    await recordAutonomousExecution({
      project: await CreativeProjectRuntime.get(creative_project_id),
      enabled: true,
      approval,
      queue,
      control: refreshedControl,
      kickoff,
      status: kickoff.accepted
        ? "ACTIVE"
        : "QUEUED_FOR_SCHEDULED_WORKER",
    });

    return {
      success: true,
      queued: true,
      autonomous: true,
      approval_required: false,
      execution_started: kickoff.accepted,
      queue,
      kickoff,
      control: refreshedControl,
      lifecycle,
    };
  },
};
