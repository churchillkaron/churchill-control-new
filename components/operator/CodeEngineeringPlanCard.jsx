"use client";

import {
  CheckCircle2,
  Circle,
  GitBranch,
  ListChecks,
  RefreshCw,
  Target,
  TriangleAlert,
} from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function human(value) {
  const normalized = text(value).replaceAll("_", " ").toLowerCase();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Planned";
}

function taskIcon(status) {
  const normalized = text(status).toUpperCase();
  if (normalized === "COMPLETED") return CheckCircle2;
  if (normalized === "IN_PROGRESS") return RefreshCw;
  return Circle;
}

function statusTone(status, dark) {
  const normalized = text(status).toUpperCase();
  if (normalized === "COMPLETED") {
    return dark ? "text-emerald-200/75" : "text-emerald-700";
  }
  if (normalized === "IN_PROGRESS") {
    return dark ? "text-[#e7c497]" : "text-[#8B663E]";
  }
  if (normalized === "BLOCKED") {
    return dark ? "text-amber-200/80" : "text-amber-700";
  }
  return dark ? "text-white/30" : "text-[#A39B92]";
}

export default function CodeEngineeringPlanCard({
  plan = null,
  theme = "light",
  compact = false,
}) {
  if (!plan?.contract) return null;

  const dark = theme === "dark";
  const tasks = list(plan.tasks);
  const visibleTasks = tasks.slice(0, compact ? 5 : 10);
  const acceptance = plan.business_acceptance || {};
  const revisionReasons = list(plan.revision_reasons);
  const progress = Math.max(0, Math.min(100, number(plan.progress_percent)));

  const shell = dark
    ? "border-white/10 bg-black/25"
    : "border-black/[0.07] bg-white";
  const item = dark
    ? "border-white/8 bg-white/[0.025]"
    : "border-black/[0.06] bg-[#FBFAF8]";
  const heading = dark ? "text-white/75" : "text-[#403A34]";
  const body = dark ? "text-white/52" : "text-[#6F685F]";
  const muted = dark ? "text-white/32" : "text-[#938C83]";

  return (
    <section
      data-avantiqo-code-engineering-plan="true"
      className={`rounded-xl border ${shell} ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] ${dark ? "text-[#e7c497]" : "text-[#8B663E]"}`}>
            <ListChecks size={11} />
            Engineering plan
          </div>
          <div className={`mt-1 text-[10px] leading-4 ${muted}`}>
            Dynamic plan · repository evidence reconciled · business outcome first
          </div>
        </div>
        <div className={`text-right text-[9px] ${muted}`}>
          <div>Revision {number(plan.revision, 1)}</div>
          <div className="mt-0.5">{progress}% complete</div>
        </div>
      </div>

      <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${dark ? "bg-white/8" : "bg-black/[0.06]"}`}>
        <div
          className={`h-full rounded-full ${dark ? "bg-[#D6A66A]" : "bg-[#9A744B]"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={`mt-3 rounded-lg border ${item} p-3`}>
        <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
          <Target size={10} />
          Current priority
        </div>
        <div className={`mt-1.5 text-[11px] font-medium leading-4 ${heading}`}>
          {plan.current_priority || human(plan.current_phase)}
        </div>
        <div className={`mt-1 text-[9px] ${muted}`}>
          {human(plan.current_phase)} · {number(plan.completed_task_count)}/{number(plan.task_count)} tasks complete
        </div>
      </div>

      {revisionReasons.length ? (
        <div className={`mt-3 rounded-lg border ${item} px-3 py-2.5`}>
          <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
            <GitBranch size={10} />
            Why the plan changed
          </div>
          <div className={`mt-1.5 text-[10px] leading-4 ${body}`}>
            {revisionReasons.map(human).join(" · ")}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-1.5">
        {visibleTasks.map((task) => {
          const Icon = taskIcon(task.status);
          const active = text(task.status).toUpperCase() === "IN_PROGRESS";
          return (
            <div
              key={task.id || `${task.phase}-${task.title}`}
              className={`flex items-start gap-2 rounded-lg border ${item} px-2.5 py-2`}
            >
              <Icon
                size={11}
                className={`mt-0.5 shrink-0 ${statusTone(task.status, dark)} ${active ? "animate-spin" : ""}`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] leading-4 ${task.status === "COMPLETED" ? muted : heading}`}>
                  {task.title || human(task.phase)}
                </div>
                <div className={`mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[8px] ${muted}`}>
                  <span>{human(task.phase)}</span>
                  {task.criterion_id ? <span>{task.criterion_id}</span> : null}
                  {task.business_outcome ? <span>business outcome</span> : null}
                  {number(task.evidence_operation_count) > 0 ? (
                    <span>{number(task.evidence_operation_count)} evidence operation{number(task.evidence_operation_count) === 1 ? "" : "s"}</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {acceptance.explicit_criteria_bound ? (
        <div
          data-avantiqo-code-business-acceptance="true"
          className={`mt-3 rounded-lg border px-3 py-2.5 ${
            acceptance.verified
              ? dark
                ? "border-emerald-300/15 bg-emerald-300/[0.05]"
                : "border-emerald-700/10 bg-emerald-50"
              : item
          }`}
        >
          <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
            {acceptance.verified ? <CheckCircle2 size={10} /> : <TriangleAlert size={10} />}
            Business acceptance
          </div>
          <div className={`mt-1.5 text-[10px] leading-4 ${body}`}>
            {number(acceptance.evidence_count)}/{number(acceptance.criteria_count)} acceptance criteria have observed engineering evidence.
            {acceptance.verified
              ? " All bound business outcomes are evidenced."
              : " Completion remains blocked until every bound outcome has evidence."}
          </div>
        </div>
      ) : null}

      <div className={`mt-2 text-[8px] leading-3.5 ${muted}`}>
        Plan progress is coordination evidence only. It grants no commit, deploy, migration, publication, or governance authority.
      </div>
    </section>
  );
}
