"use client";

import { Activity, BadgeCheck, CircleDollarSign, Clock3, Film, ShieldAlert, Sparkles, Wrench } from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function activeTask(task = {}) {
  return !task.metadata?.superseded_by_revision_task_id &&
    !task.metadata?.superseded_by_repair_task_id &&
    !task.metadata?.superseded_by_repair_review_task_id;
}

function taskPrice(task = {}) {
  const cost = object(task.cost);
  return finite(
    cost.customer_price ??
    cost.actual_customer_price ??
    task.metadata?.customer_price ??
    task.output?.customer_price,
  ) || 0;
}

function etaSeconds(task = {}) {
  const status = text(task.status).toUpperCase();
  if (!["READY", "WAITING", "RUNNING", "PLANNED", "PLANNING", "REVIEW"].includes(status)) return 0;
  return finite(
    task.timing?.remaining_seconds ??
    task.timing?.estimated_seconds ??
    task.metadata?.estimated_seconds,
  ) || 0;
}

function labelStatus(task = {}) {
  const status = text(task.status).toUpperCase();
  if (task.metadata?.selected_for_master === true) return "Winner";
  if (task.metadata?.rejected_by_candidate_competition === true) return "Rejected";
  if (task.metadata?.repair_of_task_id || task.metadata?.repaired_source_task_id) return "Repair";
  if (status === "REVIEW") return "Review";
  if (status === "FAILED" || status === "BLOCKED" || status === "SKIPPED") return "Blocked";
  if (status === "COMPLETED") return "Complete";
  return status ? status[0] + status.slice(1).toLowerCase() : "Queued";
}

function Stat({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white/75 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-[#26231F]">{value}</div>
      {detail ? <div className="mt-0.5 text-[8px] text-[#777069]">{detail}</div> : null}
    </div>
  );
}

export default function CreativeMissionControlPanel({ runtime }) {
  const allTasks = (runtime.taskRuntime?.items || []).filter(activeTask);
  const assets = runtime.assetRuntime?.items || [];
  const project = runtime.projectRuntime?.current || {};
  const blocked = allTasks.filter((task) => ["FAILED", "BLOCKED", "SKIPPED"].includes(text(task.status).toUpperCase()));
  const running = allTasks.filter((task) => ["RUNNING", "READY", "WAITING", "PLANNING", "PLANNED"].includes(text(task.status).toUpperCase()));
  const approvals = allTasks.filter((task) => task.review?.required === true && task.review?.approved !== true);
  const winners = assets.filter((node) => node.metadata?.selected_for_master === true && node.metadata?.shot_candidate_selected === true);
  const rejected = assets.filter((node) => node.metadata?.rejected_by_candidate_competition === true || node.status === "REJECTED");
  const repairs = allTasks.filter((task) => task.metadata?.repair_of_task_id || task.metadata?.repaired_source_task_id || task.metadata?.human_temporal_span_repair_bound === true);
  const spent = allTasks.reduce((sum, task) => sum + taskPrice(task), 0);
  const eta = allTasks.reduce((sum, task) => sum + etaSeconds(task), 0);
  const status = blocked.length
    ? "BLOCKED"
    : approvals.length
      ? "AWAITING APPROVAL"
      : running.length
        ? "PRODUCING"
        : allTasks.length
          ? "READY"
          : "NOT MATERIALIZED";

  return (
    <section className="border-b border-black/[0.07] bg-[#EFEAE2] px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">
            <Sparkles className="h-3 w-3" />
            Autonomous Mission Control
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold tracking-[-0.02em] text-[#28241F]">
              {project.name || "Current production"}
            </h2>
            <span className={`rounded-full border px-2 py-0.5 text-[7px] font-semibold tracking-[0.12em] ${blocked.length ? "border-red-900/20 bg-red-50 text-red-800" : approvals.length ? "border-amber-900/20 bg-amber-50 text-amber-800" : "border-emerald-900/15 bg-emerald-50 text-emerald-800"}`}>
              {status}
            </span>
          </div>
          <div className="mt-1 max-w-2xl text-[8px] leading-4 text-[#777069]">
            One governed view of production progress, candidate competition, repairs, approvals, cost and delivery readiness. Provider controls and prompts are intentionally absent.
          </div>
        </div>
        <div className="flex items-center gap-2 text-[8px] text-[#6F685F]">
          {blocked.length ? <ShieldAlert className="h-3.5 w-3.5 text-red-700" /> : running.length ? <Activity className="h-3.5 w-3.5 text-amber-700" /> : <BadgeCheck className="h-3.5 w-3.5 text-emerald-700" />}
          {blocked.length ? `${blocked.length} blocker${blocked.length === 1 ? "" : "s"}` : running.length ? `${running.length} active task${running.length === 1 ? "" : "s"}` : "No unresolved production blocker"}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Stat icon={Film} label="Tasks" value={allTasks.length} detail={`${running.length} active`} />
        <Stat icon={BadgeCheck} label="Winners" value={winners.length} detail="selected for master" />
        <Stat icon={ShieldAlert} label="Rejected" value={rejected.length} detail="excluded by quality" />
        <Stat icon={Wrench} label="Repairs" value={repairs.length} detail="governed recovery" />
        <Stat icon={Activity} label="Approvals" value={approvals.length} detail="human decisions due" />
        <Stat icon={CircleDollarSign} label="Cost" value={spent ? spent.toFixed(2) : "0"} detail="recorded customer price" />
        <Stat icon={Clock3} label="ETA" value={eta ? `${Math.ceil(eta / 60)}m` : "—"} detail="declared task estimates" />
        <Stat icon={Sparkles} label="Assets" value={assets.length} detail="production graph outputs" />
      </div>

      {allTasks.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {allTasks.slice(0, 12).map((task) => (
            <div key={task.id} className="min-w-[150px] rounded-lg border border-black/[0.06] bg-white/55 px-2.5 py-2">
              <div className="truncate text-[8px] font-medium text-[#302C27]">{task.title || task.description || task.type || "Production task"}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[7px] text-[#7D756C]">
                <span>{labelStatus(task)}</span>
                <span>{task.metadata?.shot_id ? `Shot ${text(task.metadata.shot_number || task.metadata.shot_id).slice(0, 7)}` : text(task.type).replaceAll("_", " ")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
