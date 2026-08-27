import { readSecretaryExecutiveBriefingV6 } from "@/lib/operator/secretary/SecretaryExecutiveBriefingV6Runtime";
import { listSecretaryExecutiveDirectives } from "@/lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V7";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function readFailure(name, error) {
  return {
    source: name,
    error: text(error?.message || error, 500) || "SOURCE_READ_FAILED",
  };
}

async function settle(name, read) {
  try {
    return { name, data: await read(), error: null };
  } catch (error) {
    return { name, data: null, error: readFailure(name, error) };
  }
}

function epoch(value) {
  const raw = text(value, 180);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function directiveVersion(item) {
  return object(item?.current_version || item?.latest_version);
}

function directiveHasExecutionLink(item) {
  const version = directiveVersion(item);
  return Boolean(
    text(version.execution_task_id, 120) ||
    text(version.execution_job_id, 120),
  );
}

function directiveExecutionTerminal(item) {
  const execution = object(item?.execution);
  const taskStatus = text(execution?.task?.status, 80).toUpperCase();
  const jobStatus = text(execution?.job?.status, 80).toUpperCase();
  return ["DONE", "CANCELLED"].includes(taskStatus) ||
    ["COMPLETED", "FAILED", "CANCELLED"].includes(jobStatus);
}

function directiveSections(result, nowValue) {
  const directives = list(result?.directives);
  const current = list(result?.current_directives);
  const completed = list(result?.completed_directives);
  const cancelled = list(result?.cancelled_directives);
  const nowMs = epoch(nowValue) ?? Date.now();

  const overdueCurrent = current.filter((item) => {
    const dueMs = epoch(directiveVersion(item).due_at);
    return dueMs !== null && dueMs < nowMs;
  });
  const currentWithExecutionLink = current.filter(directiveHasExecutionLink);
  const currentWithoutExecutionLink = current.filter((item) => !directiveHasExecutionLink(item));
  const linkedExecutionTerminalCurrent = current.filter((item) =>
    directiveHasExecutionLink(item) && directiveExecutionTerminal(item));

  return {
    directives,
    current,
    completed,
    cancelled,
    overdue_current: overdueCurrent,
    current_with_execution_link: currentWithExecutionLink,
    current_without_execution_link: currentWithoutExecutionLink,
    linked_execution_terminal_current: linkedExecutionTerminalCurrent,
    summary: {
      ...object(result?.summary),
      current_lineages: Number(result?.summary?.current_lineages || current.length || 0),
      completed_lineages: Number(result?.summary?.completed_lineages || completed.length || 0),
      cancelled_lineages: Number(result?.summary?.cancelled_lineages || cancelled.length || 0),
      overdue_current_count: overdueCurrent.length,
      current_with_execution_link_count: currentWithExecutionLink.length,
      current_without_execution_link_count: currentWithoutExecutionLink.length,
      linked_execution_terminal_current_count: linkedExecutionTerminalCurrent.length,
    },
    evidence_only: true,
    durable_records_only: true,
    ledger_rows_are_execution_work: false,
    counted_again_in_v7_exception_total: false,
    counted_again_in_v7_secretary_owned_total: false,
    overdue_is_temporal_only: true,
    execution_terminal_is_directive_completion: false,
    directive_inferred: false,
    directive_issued_by_secretary: false,
    issuer_inferred: false,
    target_inferred: false,
    due_at_inferred: false,
    execution_link_inferred: false,
    completion_inferred: false,
    payment_authority_created: false,
    signing_authority_created: false,
    booking_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

function headlineV7(base, directives) {
  const current = Number(directives?.summary?.current_lineages || directives?.current?.length || 0);
  const completed = Number(directives?.summary?.completed_lineages || directives?.completed?.length || 0);
  const cancelled = Number(directives?.summary?.cancelled_lineages || directives?.cancelled?.length || 0);
  const overdue = Number(directives?.summary?.overdue_current_count || 0);
  const terminalLinked = Number(directives?.summary?.linked_execution_terminal_current_count || 0);
  return [
    base?.headline || null,
    `${current} current executive directive${current === 1 ? "" : "s"} in the durable register`,
    completed ? `${completed} completed directive lineage${completed === 1 ? "" : "s"} preserved with explicit completion evidence` : null,
    cancelled ? `${cancelled} cancelled directive lineage${cancelled === 1 ? "" : "s"} preserved in history` : null,
    overdue ? `${overdue} current directive${overdue === 1 ? " has" : "s have"} an explicit due timestamp already past` : null,
    terminalLinked ? `${terminalLinked} current directive${terminalLinked === 1 ? " has" : "s have"} terminal linked execution while directive completion remains unproven` : null,
    "V7 preserves V6 exception and Secretary-owned counts; directive-register ledger rows are not added again as work, exceptions, commitments, or decisions.",
  ].filter(Boolean).join("; ");
}

export async function readSecretaryExecutiveBriefingV7({ context, payload = {} } = {}) {
  organizationId(context);
  const limit = Math.min(300, Math.max(1, Number(payload.limit || 100)));
  const base = await readSecretaryExecutiveBriefingV6({ context, payload });
  const baseDesk = object(base.executive_desk);
  const nowValue = payload.now || new Date().toISOString();

  const directivesRead = await settle(
    "directive_register",
    () => listSecretaryExecutiveDirectives({ context, payload: { limit } }),
  );
  const directives = directiveSections(directivesRead.data, nowValue);

  const sourceErrors = [
    ...list(base?.source_status?.source_errors),
    directivesRead.error,
  ].filter(Boolean);

  const v6ExceptionCount = Number(baseDesk.exception_count || 0);
  const v6SecretaryOwnedCount = Number(baseDesk.secretary_owned_count || 0);

  return {
    status: "completed",
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    cadence: base.cadence,
    window: base.window,
    headline: headlineV7(base, directives),
    executive_desk: {
      ...baseDesk,
      directive_register: directives,
      exception_count: v6ExceptionCount,
      secretary_owned_count: v6SecretaryOwnedCount,
      current_directive_count: Number(directives.summary.current_lineages || directives.current.length || 0),
      completed_directive_count: Number(directives.summary.completed_lineages || directives.completed.length || 0),
      cancelled_directive_count: Number(directives.summary.cancelled_lineages || directives.cancelled.length || 0),
      overdue_current_directive_count: Number(directives.summary.overdue_current_count || 0),
      current_directive_with_execution_link_count: Number(directives.summary.current_with_execution_link_count || 0),
      current_directive_without_execution_link_count: Number(directives.summary.current_without_execution_link_count || 0),
      current_directive_linked_execution_terminal_count: Number(directives.summary.linked_execution_terminal_current_count || 0),
      counting_policy: {
        ...object(baseDesk.counting_policy),
        v6_exception_count_preserved: true,
        v6_secretary_owned_count_preserved: true,
        directive_register_not_added_again: true,
        directive_ledger_rows_not_execution_work: true,
        directive_register_not_reclassified_as_decisions: true,
        directive_register_not_reclassified_as_commitments: true,
      },
    },
    source_status: {
      complete: sourceErrors.length === 0,
      source_errors: sourceErrors,
      partial_briefing_allowed: true,
    },
    underlying_v6: base,
    evidence_only: true,
    conclusions_not_inferred: true,
    directive_inferred: false,
    directive_issued_by_secretary: false,
    directive_completion_inferred: false,
    directive_overdue_is_temporal_only: true,
    directive_execution_terminal_is_completion: false,
    directive_target_inferred: false,
    directive_due_at_inferred: false,
    directive_execution_link_inferred: false,
    decision_inferred: false,
    decision_made_by_secretary: false,
    commitment_inferred: false,
    urgency_inferred: false,
    legal_breach_inferred: false,
    preferences_inferred: false,
    travel_confirmation_inferred: false,
    travel_cancellation_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    signing_authority_created: false,
    binding_authority_created: false,
    approval_extends_authority: false,
    approval_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export default readSecretaryExecutiveBriefingV7;
