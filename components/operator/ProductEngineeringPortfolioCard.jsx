"use client";

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
  };
}

function RoadmapNode({ node, current, theme }) {
  const s = styles(theme);
  const waitingPersistence = node?.persistence_confirmation_required === true ||
    text(node?.status) === "WAITING_GOVERNED_PERSISTENCE";
  const completed = text(node?.status) === "PERSISTED_VERIFIED";
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${current ? s.active : s.panel}`}
      data-avantiqo-product-roadmap-node={text(node?.node_id) || "unknown"}
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

      {waitingPersistence ? (
        <div className={`mt-2 text-[10px] leading-4 ${s.gold}`}>
          Engineering is locally verified. The roadmap is paused at governed persistence before any dependent objective can advance.
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
    </div>
  );
}

export default function ProductEngineeringPortfolioCard({
  portfolio,
  theme = "light",
  compact = false,
}) {
  if (!portfolio?.contract || portfolio?.unavailable === true) return null;
  const s = styles(theme);
  const roadmap = list(portfolio.roadmap);
  const completed = list(portfolio.completed_objectives);
  const progress = portfolio.business_progress || {};
  const currentNodeId = text(portfolio.current_node_id);
  const currentNode = roadmap.find((node) => text(node?.node_id) === currentNodeId) || null;

  return (
    <section
      className={`rounded-2xl border ${s.shell} ${compact ? "p-4" : "p-5"}`}
      data-avantiqo-product-engineering-portfolio="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${s.gold}`}>
            Business engineering roadmap
          </div>
          <h3 className="mt-1 text-[14px] font-semibold leading-5">
            {text(portfolio.business_goal) || "Avantiqo product improvement portfolio"}
          </h3>
          <p className={`mt-1 max-w-3xl text-[10px] leading-4 ${s.muted}`}>
            One business goal → repository-grounded objectives → verified persistence → fresh-main re-ranking. Business Partner remains the control plane.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-semibold tabular-nums">
            {Number(progress.percent || 0)}%
          </div>
          <div className={`text-[9px] uppercase tracking-[0.14em] ${s.faint}`}>
            {statusLabel(portfolio.status)}
          </div>
        </div>
      </div>

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
        <span>revision {Number(portfolio.revision || 1)}</span>
        {shortCommit(portfolio.current_main_head)
          ? <span>main {shortCommit(portfolio.current_main_head)}</span>
          : null}
      </div>

      {portfolio?.anti_loop?.triggered === true ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-[10px] leading-4 ${s.active}`}>
          Automatic progression stopped because fresh main selected an already-completed objective again. Product review is required instead of looping.
        </div>
      ) : null}

      <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {roadmap.map((node) => (
          <RoadmapNode
            key={node.node_id || `${node.rank}-${node.objective}`}
            node={node}
            current={Boolean(currentNode && node.node_id === currentNode.node_id)}
            theme={theme}
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
        Current main is authoritative. Queued objectives are provisional. Maximum one active engineering cycle · no parallel source mutation · no hidden branches/worktrees · no automatic commit · no production deploy.
      </div>
    </section>
  );
}
