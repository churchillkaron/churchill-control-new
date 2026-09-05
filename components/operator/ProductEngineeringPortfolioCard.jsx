"use client";

import { useEffect, useMemo, useState } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function statusLabel(value) {
  return text(value || "unknown")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortCommit(value) {
  const commit = text(value);
  return commit ? commit.slice(0, 9) : null;
}

function styles(theme) {
  const dark = theme === "dark";
  return {
    shell: dark
      ? "border-white/10 bg-[#0d0d0d] text-white"
      : "border-black/10 bg-white text-[#181818]",
    muted: dark ? "text-white/48" : "text-black/48",
    faint: dark ? "text-white/32" : "text-black/36",
    panel: dark ? "border-white/8 bg-white/[0.025]" : "border-black/8 bg-black/[0.018]",
    active: dark ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.06]" : "border-[#9b6b32]/25 bg-[#D6A66A]/[0.08]",
    badge: dark ? "border-white/10 bg-white/[0.035] text-white/58" : "border-black/10 bg-black/[0.025] text-black/58",
    gold: dark ? "text-[#D6A66A]" : "text-[#8b5b25]",
    button: dark
      ? "border-white/10 bg-white/[0.035] text-white/64 hover:bg-white/[0.07]"
      : "border-black/10 bg-black/[0.025] text-black/62 hover:bg-black/[0.05]",
    buttonGold: dark
      ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.08] text-[#D6A66A] hover:bg-[#D6A66A]/[0.13]"
      : "border-[#9b6b32]/25 bg-[#D6A66A]/[0.09] text-[#80501f] hover:bg-[#D6A66A]/[0.15]",
    danger: dark
      ? "border-red-300/15 bg-red-300/[0.04] text-red-200/70 hover:bg-red-300/[0.08]"
      : "border-red-900/10 bg-red-900/[0.025] text-red-900/58 hover:bg-red-900/[0.055]",
  };
}

function ControlButton({ children, onClick, disabled, tone = "default", theme }) {
  const s = styles(theme);
  const cls = tone === "gold" ? s.buttonGold : tone === "danger" ? s.danger : s.button;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-35 ${cls}`}
    >
      {children}
    </button>
  );
}

function RoadmapNode({
  node,
  current,
  theme,
  controlEnabled,
  pendingAction,
  onAction,
}) {
  const s = styles(theme);
  const waitingPersistence = node?.persistence_confirmation_required === true ||
    text(node?.status) === "WAITING_GOVERNED_PERSISTENCE";
  const completed = text(node?.status) === "PERSISTED_VERIFIED";
  const ownerDirective = text(node?.owner_directive);
  const queued = !current && !completed;
  const actionBusy = Boolean(pendingAction);

  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${current ? s.active : s.panel}`}
      data-avantiqo-product-roadmap-node={text(node?.node_id) || "unknown"}
      data-avantiqo-owner-directive={ownerDirective || "none"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[10px] font-medium uppercase tracking-[0.16em] ${current ? s.gold : s.faint}`}>
            {current ? "Current objective" : `Priority ${Number(node?.rank || 0) || "–"}`}
          </div>
          <div className="mt-1 text-[12px] font-medium leading-5">
            {text(node?.objective) || "Repository-grounded objective"}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.12em] ${s.badge}`}>
          {statusLabel(node?.status)}
        </span>
      </div>

      <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${s.muted}`}>
        <span>{Number(node?.completion_criteria_count || 0)} acceptance criteria</span>
        <span>{Number(node?.dependency_count || 0)} dependencies</span>
        <span>{Number(node?.evidence_area_count || 0)} evidence areas</span>
        {node?.engineering_verified_complete === true ? <span>engineering verified</span> : null}
        {node?.business_acceptance_verified === true ? <span>business acceptance verified</span> : null}
        {completed && shortCommit(node?.verified_commit_sha)
          ? <span>main {shortCommit(node.verified_commit_sha)}</span>
          : null}
      </div>

      {ownerDirective ? (
        <div className={`mt-2 text-[10px] leading-4 ${ownerDirective === "PROMOTE" ? s.gold : s.muted}`}>
          Owner directive: {statusLabel(ownerDirective)}
          {node?.owner_priority_blocked_by_dependency === true
            ? " · blocked by dependency until prerequisite is cleared"
            : ""}
          {text(node?.owner_directive_reason) ? ` · ${text(node.owner_directive_reason)}` : ""}
        </div>
      ) : null}

      {waitingPersistence ? (
        <div className={`mt-2 text-[10px] leading-4 ${s.gold}`}>
          Engineering is locally verified. The roadmap is paused at governed persistence before any dependent objective can advance.
        </div>
      ) : null}
      {current ? (
        <div className={`mt-2 text-[10px] leading-4 ${s.faint}`}>
          Claimed work is immutable. Owner controls apply at the next safe boundary; the active objective is never silently rewritten.
        </div>
      ) : null}
      {node?.independent_evidence_scope === true ? (
        <div className={`mt-2 text-[10px] leading-4 ${s.muted}`}>
          Independent evidence scope detected, but execution remains serialized on current main—no hidden branch or worktree fan-out.
        </div>
      ) : null}
      {node?.provisional_until_fresh_main_reassessment === true ? (
        <div className={`mt-2 text-[10px] leading-4 ${s.faint}`}>
          Provisional. Rank and scope will be recomputed after the preceding objective is persisted and independently verified on main.
        </div>
      ) : null}

      {controlEnabled && queued ? (
        <div className="mt-3 flex flex-wrap gap-1.5" data-avantiqo-portfolio-node-controls="true">
          {ownerDirective !== "PROMOTE" ? (
            <ControlButton
              theme={theme}
              tone="gold"
              disabled={actionBusy}
              onClick={() => onAction("PROMOTE", node)}
            >
              Make next
            </ControlButton>
          ) : null}
          {ownerDirective !== "DEFER" ? (
            <ControlButton
              theme={theme}
              disabled={actionBusy}
              onClick={() => onAction("DEFER", node)}
            >
              Defer
            </ControlButton>
          ) : null}
          {ownerDirective !== "REMOVE" ? (
            <ControlButton
              theme={theme}
              tone="danger"
              disabled={actionBusy}
              onClick={() => onAction("REMOVE", node)}
            >
              Remove
            </ControlButton>
          ) : null}
          {ownerDirective ? (
            <ControlButton
              theme={theme}
              disabled={actionBusy}
              onClick={() => onAction("RESTORE", node)}
            >
              Restore
            </ControlButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ProductEngineeringPortfolioCard({
  portfolio,
  organizationId,
  theme = "light",
  compact = false,
}) {
  const [visiblePortfolio, setVisiblePortfolio] = useState(portfolio || null);
  const [pendingAction, setPendingAction] = useState(null);
  const [controlError, setControlError] = useState(null);

  useEffect(() => {
    setVisiblePortfolio(portfolio || null);
  }, [portfolio]);

  const current = visiblePortfolio || portfolio;
  const s = styles(theme);
  const roadmap = list(current?.roadmap);
  const completed = list(current?.completed_objectives);
  const progress = current?.business_progress || {};
  const currentNodeId = text(current?.current_node_id);
  const currentNode = roadmap.find((node) => text(node?.node_id) === currentNodeId) || null;
  const ownerControl = current?.owner_control || null;
  const controlRevision = Number(ownerControl?.control_revision || 0);
  const paused = ownerControl?.paused === true;
  const controlEnabled = Boolean(organizationId && current?.portfolio_id);
  const ownerDecisionCount = list(ownerControl?.decision_history).length;

  const pendingLabel = useMemo(() => {
    if (!pendingAction) return null;
    return `${statusLabel(pendingAction.action)}${pendingAction.objective ? ` · ${pendingAction.objective}` : ""}`;
  }, [pendingAction]);

  if (!current?.contract || current?.unavailable === true) return null;

  async function applyControl(action, node = null) {
    if (!controlEnabled || pendingAction) return;
    const requestState = {
      action,
      objective: node ? text(node.objective) : null,
    };
    setPendingAction(requestState);
    setControlError(null);
    try {
      const response = await fetch("/api/operator/code/portfolio/control", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          portfolioId: current.portfolio_id,
          action,
          ...(node?.node_id ? { nodeId: node.node_id } : {}),
          expectedControlRevision: controlRevision,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) {
        throw new Error(body?.error || `PORTFOLIO_CONTROL_HTTP_${response.status}`);
      }
      if (body?.portfolio) setVisiblePortfolio(body.portfolio);
    } catch (error) {
      const code = text(error?.message || error);
      setControlError(
        code === "PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_REVISION_CONFLICT"
          ? "The roadmap changed in another tab. The live feed will refresh it before you retry."
          : code === "PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTIVE_OBJECTIVE_IMMUTABLE"
            ? "That objective is already claimed. Change the next queued objective instead."
            : "Owner control could not be saved. No source code or deployment action was performed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      className={`rounded-2xl border ${s.shell} ${compact ? "p-4" : "p-5"}`}
      data-avantiqo-product-engineering-portfolio="true"
      data-avantiqo-product-engineering-owner-control="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${s.gold}`}>
            Business engineering roadmap
          </div>
          <h3 className="mt-1 text-[14px] font-semibold leading-5">
            {text(current.business_goal) || "Avantiqo product improvement portfolio"}
          </h3>
          <p className={`mt-1 max-w-3xl text-[10px] leading-4 ${s.muted}`}>
            One business goal → repository-grounded objectives → verified persistence → fresh-main re-ranking. Owner decisions are durable; Business Partner remains the control plane.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-semibold tabular-nums">
            {Number(progress.percent || 0)}%
          </div>
          <div className={`text-[9px] uppercase tracking-[0.14em] ${s.faint}`}>
            {statusLabel(current.status)}
          </div>
        </div>
      </div>

      {controlEnabled ? (
        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${s.panel}`}>
          <div>
            <div className="text-[10px] font-medium">Owner control</div>
            <div className={`mt-0.5 text-[9px] leading-4 ${s.muted}`}>
              {paused
                ? ownerControl?.pause_mode === "AFTER_CURRENT_SAFE_BOUNDARY"
                  ? "Paused after the current claimed objective reaches its next safe boundary."
                  : "Paused before the next engineering cycle."
                : "Autonomous roadmap progression is enabled within existing governance."}
              {ownerDecisionCount ? ` · ${ownerDecisionCount} recent owner decisions` : ""}
            </div>
          </div>
          <ControlButton
            theme={theme}
            tone={paused ? "gold" : "default"}
            disabled={Boolean(pendingAction)}
            onClick={() => applyControl(paused ? "RESUME" : "PAUSE")}
          >
            {paused ? "Resume roadmap" : "Pause roadmap"}
          </ControlButton>
        </div>
      ) : null}

      {pendingLabel ? (
        <div className={`mt-2 text-[9px] ${s.faint}`}>Saving owner decision: {pendingLabel}</div>
      ) : null}
      {controlError ? (
        <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[9px] leading-4 ${s.active}`}>
          {controlError}
        </div>
      ) : null}

      <div className={`mt-4 h-1 overflow-hidden rounded-full ${theme === "dark" ? "bg-white/8" : "bg-black/7"}`}>
        <div
          className="h-full rounded-full bg-current transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%` }}
          aria-label={`${Number(progress.percent || 0)} percent of persisted verified roadmap outcomes complete`}
        />
      </div>

      <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] ${s.muted}`}>
        <span>{Number(progress.persisted_verified_objective_count || 0)} persisted + verified</span>
        <span>{roadmap.length} current-main roadmap objectives</span>
        <span>roadmap revision {Number(current.revision || 1)}</span>
        {ownerControl?.contract ? <span>control revision {controlRevision}</span> : null}
        {shortCommit(current.current_main_head)
          ? <span>main {shortCommit(current.current_main_head)}</span>
          : null}
      </div>

      {current?.anti_loop?.triggered === true ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-[10px] leading-4 ${s.active}`}>
          Automatic progression stopped because fresh main selected an already-completed objective again. Product review is required instead of looping.
        </div>
      ) : null}

      {ownerControl?.unmatched_directive_count > 0 ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-[10px] leading-4 ${s.panel} ${s.muted}`}>
          {ownerControl.unmatched_directive_count} owner directive{ownerControl.unmatched_directive_count === 1 ? "" : "s"} no longer match the fresh-main assessment. They remain in the audit history but do not control unrelated new objectives.
        </div>
      ) : null}

      <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {roadmap.map((node) => (
          <RoadmapNode
            key={node.node_id || `${node.rank}-${node.objective}`}
            node={node}
            current={Boolean(currentNode && node.node_id === currentNode.node_id)}
            theme={theme}
            controlEnabled={controlEnabled}
            pendingAction={pendingAction}
            onAction={applyControl}
          />
        ))}
      </div>

      {!compact && completed.length ? (
        <div className="mt-4">
          <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${s.faint}`}>
            Verified persisted outcomes
          </div>
          <div className="mt-2 space-y-1.5">
            {completed.slice(-4).reverse().map((entry, index) => (
              <div key={`${entry.verified_commit_sha || index}`} className={`flex items-start justify-between gap-3 text-[10px] ${s.muted}`}>
                <span className="min-w-0 truncate">{text(entry.objective) || "Completed objective"}</span>
                <span className="shrink-0 font-mono">{shortCommit(entry.verified_commit_sha) || "verified"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`mt-4 border-t pt-3 text-[9px] leading-4 ${theme === "dark" ? "border-white/8" : "border-black/8"} ${s.faint}`}>
        Current main is authoritative. Claimed work is immutable. Owner controls affect future execution order only. Queued objectives remain provisional · maximum one active engineering cycle · no parallel source mutation · no hidden branches/worktrees · no automatic commit · no production deploy.
      </div>
    </section>
  );
}
