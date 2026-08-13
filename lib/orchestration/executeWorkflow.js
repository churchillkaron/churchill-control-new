import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { resolveDelegatedOrganizationAccess } from "@/lib/platform/security/resolveDelegatedOrganizationAccess";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function durationMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

async function executionAccess({ workflow, organizationId, executionContext }) {
  if (executionContext?.actor && Array.isArray(executionContext?.permissions)) {
    return executionContext;
  }

  return resolveDelegatedOrganizationAccess({
    organizationId,
    userId: workflow.created_by,
  });
}

async function writeWorkflowLog({
  organizationId,
  workflow,
  run,
  status,
  payload = {},
  result = null,
  error = null,
  startedAt = null,
  completedAt = null,
}) {
  const { error: logError } = await supabaseAdmin
    .from("workflow_logs")
    .insert({
      organization_id: organizationId,
      event: "AVANTIQO_AUTOMATION_RUN",
      workflow: workflow.workflow_name,
      status,
      payload,
      result,
      error,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms:
        startedAt && completedAt
          ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
          : null,
      workflow_execution_key: run?.id || null,
      replayable: true,
    });

  if (logError) {
    console.error("AUTOMATION_WORKFLOW_LOG_ERROR", logError.message);
  }
}

export async function executeWorkflow({
  organizationId,
  workflowId,
  executionReference = null,
  inputPayload = {},
  triggerSource = "API",
  executionContext = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!workflowId) throw new Error("workflowId required");

  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("enterprise_workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", workflowId)
    .eq("active", true)
    .maybeSingle();

  if (workflowError) throw workflowError;
  if (!workflow) throw new Error("Workflow not found");

  const { data: steps, error: stepsError } = await supabaseAdmin
    .from("enterprise_workflow_steps")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("enterprise_workflow_id", workflowId)
    .eq("active", true)
    .order("step_order", { ascending: true });

  if (stepsError) throw stepsError;
  if (!(steps || []).length) throw new Error("Workflow has no executable steps");

  const payload = {
    ...object(inputPayload),
    ...(executionReference ? { execution_reference: executionReference } : {}),
  };

  if (executionReference) {
    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("enterprise_workflow_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("enterprise_workflow_id", workflowId)
      .contains("input_payload", { execution_reference: executionReference })
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return {
        executionId: duplicate.id,
        status: duplicate.run_status,
        workflowId,
        organizationId,
        duplicate: true,
        output: duplicate.output_payload || {},
      };
    }
  }

  const startedAtIso = new Date().toISOString();
  const startedClock = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from("enterprise_workflow_runs")
    .insert({
      organization_id: organizationId,
      enterprise_workflow_id: workflowId,
      run_status: "RUNNING",
      trigger_source: triggerSource,
      input_payload: payload,
      started_at: startedAtIso,
    })
    .select("*")
    .single();

  if (runError) throw runError;

  try {
    const access = await executionAccess({
      workflow,
      organizationId,
      executionContext,
    });
    const definition = object(workflow.workflow_definition);
    const entityId =
      executionContext?.entityId ||
      executionContext?.entity_id ||
      definition.context?.entity_id ||
      null;
    const periodId =
      executionContext?.periodId ||
      executionContext?.period_id ||
      definition.context?.period_id ||
      null;
    const partyId = access.partyId || access.party_id || access.actor?.partyId || null;

    let state = {
      ...payload,
      organizationId,
      organization_id: organizationId,
      entityId,
      entity_id: entityId,
      periodId,
      period_id: periodId,
      partyId,
      party_id: partyId,
    };

    const stepResults = [];

    for (const step of steps) {
      if (text(step.action_type).toUpperCase() !== "UBTE_CAPABILITY") {
        throw new Error(`Unsupported automation action type: ${step.action_type}`);
      }

      const config = object(step.action_config);
      const domain = text(config.domain);
      const capability = text(config.capability);
      const action = text(config.action);

      if (!domain || !capability || !action) {
        throw new Error(`Automation step ${step.step_name} has an invalid UBTE capability`);
      }

      const stepStartedIso = new Date().toISOString();
      const stepStartedClock = Date.now();
      const stepInput = {
        ...state,
        ...object(config.payload),
      };

      const { data: stepRun, error: stepRunError } = await supabaseAdmin
        .from("enterprise_workflow_step_runs")
        .insert({
          organization_id: organizationId,
          enterprise_workflow_run_id: run.id,
          enterprise_workflow_step_id: step.id,
          run_status: "RUNNING",
          retry_attempt: 0,
          input_payload: stepInput,
          started_at: stepStartedIso,
        })
        .select("*")
        .single();

      if (stepRunError) throw stepRunError;

      try {
        const execution = await executeUbteCapability({
          organizationId,
          domain,
          capability,
          action,
          payload: stepInput,
          actor: access.actor,
          runtime: {
            entityId,
            periodId,
            permissions: access.permissions || [],
            locale: definition.context?.locale || null,
            timezone: definition.context?.timezone || null,
            metadata: {
              source: "AVANTIQO_AUTOMATION",
              triggerSource,
              workflowId,
              workflowRunId: run.id,
              workflowStepId: step.id,
              partyId,
              delegated: !executionContext,
            },
          },
        });

        const stepCompletedIso = new Date().toISOString();
        const output = object(execution?.result);

        await supabaseAdmin
          .from("enterprise_workflow_step_runs")
          .update({
            run_status: "COMPLETED",
            output_payload: output,
            completed_at: stepCompletedIso,
            duration_ms: durationMs(stepStartedClock),
          })
          .eq("organization_id", organizationId)
          .eq("id", stepRun.id);

        state = {
          ...state,
          ...output,
        };
        stepResults.push({
          step_id: step.id,
          step_name: step.step_name,
          status: "COMPLETED",
          result: output,
        });
      } catch (error) {
        await supabaseAdmin
          .from("enterprise_workflow_step_runs")
          .update({
            run_status: "FAILED",
            error_message: error?.message || "Automation step failed",
            completed_at: new Date().toISOString(),
            duration_ms: durationMs(stepStartedClock),
          })
          .eq("organization_id", organizationId)
          .eq("id", stepRun.id);
        throw error;
      }
    }

    const completedAtIso = new Date().toISOString();
    const output = {
      state,
      steps: stepResults,
    };

    await supabaseAdmin
      .from("enterprise_workflow_runs")
      .update({
        run_status: "COMPLETED",
        output_payload: output,
        completed_at: completedAtIso,
        duration_ms: durationMs(startedClock),
      })
      .eq("organization_id", organizationId)
      .eq("id", run.id);

    await supabaseAdmin
      .from("enterprise_workflows")
      .update({
        last_run_at: completedAtIso,
        total_runs: Number(workflow.total_runs || 0) + 1,
        successful_runs: Number(workflow.successful_runs || 0) + 1,
        updated_at: completedAtIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", workflowId);

    await writeWorkflowLog({
      organizationId,
      workflow,
      run,
      status: "COMPLETED",
      payload,
      result: output,
      startedAt: startedAtIso,
      completedAt: completedAtIso,
    });

    return {
      executionId: run.id,
      status: "COMPLETED",
      workflowId,
      organizationId,
      duplicate: false,
      output,
    };
  } catch (error) {
    const completedAtIso = new Date().toISOString();

    await supabaseAdmin
      .from("enterprise_workflow_runs")
      .update({
        run_status: "FAILED",
        error_message: error?.message || "Automation workflow failed",
        completed_at: completedAtIso,
        duration_ms: durationMs(startedClock),
      })
      .eq("organization_id", organizationId)
      .eq("id", run.id);

    await supabaseAdmin
      .from("enterprise_workflows")
      .update({
        last_run_at: completedAtIso,
        total_runs: Number(workflow.total_runs || 0) + 1,
        failed_runs: Number(workflow.failed_runs || 0) + 1,
        updated_at: completedAtIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", workflowId);

    await writeWorkflowLog({
      organizationId,
      workflow,
      run,
      status: "FAILED",
      payload,
      error: error?.message || "Automation workflow failed",
      startedAt: startedAtIso,
      completedAt: completedAtIso,
    });

    throw error;
  }
}
