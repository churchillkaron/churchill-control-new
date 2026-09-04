"use client";

import { Activity, Layers3, ShieldCheck, Sparkles } from "lucide-react";

import PropertyEditor from "../properties/PropertyEditor";
import CinematicCoverageEditor from "../properties/CinematicCoverageEditor";

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function stageGuidance(stage) {
  const key = String(stage || "MISSION_CREATED").toUpperCase();
  const guidance = {
    MISSION_CREATED: ["Define the outcome", "Confirm the business goal and success condition before production starts."],
    UNDERSTANDING: ["Build the brief", "Resolve audience, brand, constraints, references and missing context."],
    RESEARCHING: ["Strengthen the evidence", "Collect only the research that can materially change the creative decision."],
    BUILDING_STRATEGY: ["Choose the direction", "Turn the brief into a clear creative strategy and production approach."],
    BUILDING_CONCEPT: ["Make the idea concrete", "Develop distinct concepts, compare them and protect approved decisions."],
    WAITING_APPROVAL: ["Decision required", "Review the meaningful alternatives and approve the direction before more work is produced."],
    BUILDING_STORYBOARD: ["Lock the narrative", "Check sequence, coverage, continuity and whether every planned asset earns its place."],
    PLANNING_PRODUCTION: ["Prepare production", "Resolve dependencies, specialist work, source assets and execution order."],
    READY_FOR_EXECUTION: ["Ready to produce", "The plan is prepared. Confirm the material execution decision before paid production begins."],
    EXECUTING: ["Production started", "Protect approved context and let each specialist execute only its assigned work."],
    PRODUCING: ["Production in progress", "Watch blocking tasks, versions and continuity rather than restarting the whole job."],
    RENDERING: ["Finish the output", "Complete technical rendering while preserving the approved creative state."],
    REVIEWING: ["Review the work", "Compare versions, quality, continuity and requested changes before approval."],
    PUBLISHING: ["Prepare delivery", "Confirm formats, channels, rights, captions, metadata and final approved versions."],
    MONITORING: ["Observe the result", "Measure the released work against the mission outcome without changing the approved master."],
    LEARNING: ["Capture learning", "Turn evidence into reusable creative intelligence for the next mission."],
    COMPLETED: ["Project complete", "The approved production record, versions, evidence and delivery history remain available."],
  };
  return guidance[key] || [titleCase(key), "Continue from the current governed project state."];
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.055] py-2.5 last:border-b-0">
      <div className="text-[10px] text-white/30">{label}</div>
      <div className="max-w-[62%] truncate text-right text-[10px] font-medium text-white/60">
        {value ?? "-"}
      </div>
    </div>
  );
}

function Section({ eyebrow, title, icon: Icon, children, accent = false }) {
  return (
    <section className={`border-b border-white/[0.065] px-4 py-4 ${accent ? "bg-[#D6A66A]/[0.025]" : ""}`}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className={`h-3.5 w-3.5 ${accent ? "text-[#D6A66A]/75" : "text-white/30"}`} strokeWidth={1.6} /> : null}
        <div className={`text-[8px] font-semibold uppercase tracking-[0.22em] ${accent ? "text-[#D6A66A]/70" : "text-white/25"}`}>
          {eyebrow}
        </div>
      </div>
      {title ? <h3 className="mt-2 text-[13px] font-medium leading-5 text-white/78">{title}</h3> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function Inspector({ runtime, editor }) {
  const selection = editor.selection?.data || {};
  const selectionType = editor.selection?.type || null;
  const stage = runtime.stateRuntime?.current?.stage || "MISSION_CREATED";
  const [guidanceTitle, guidanceBody] = stageGuidance(stage);
  const mission = runtime.missionRuntime?.current || null;
  const project = runtime.projectRuntime?.current || null;
  const assetCount = runtime.assetRuntime?.items?.length || 0;
  const taskCount = runtime.taskRuntime?.items?.length || 0;
  const hasSelection = Boolean(selectionType || Object.keys(selection).length);
  const professionalProductionSelection = ["scene", "shot"].includes(selectionType);

  return (
    <aside className="h-full overflow-y-auto bg-[#080807]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#080807]/95 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]/68">
            Intelligence Inspector
          </div>
          <div className="mt-0.5 text-[10px] text-white/24">Context before controls</div>
        </div>
        <Sparkles className="h-4 w-4 text-[#D6A66A]/55" strokeWidth={1.5} />
      </div>

      <Section eyebrow="What matters now" title={guidanceTitle} icon={Activity} accent>
        <p className="text-[11px] leading-5 text-white/38">{guidanceBody}</p>
      </Section>

      <Section eyebrow="Project truth" icon={ShieldCheck}>
        <Row label="Mission" value={mission?.title || mission?.business_goal || "No active mission"} />
        <Row label="Project" value={project?.name || "Not created yet"} />
        <Row label="Stage" value={titleCase(stage)} />
        <Row label="Mission status" value={mission?.status || "draft"} />
      </Section>

      <Section eyebrow="Shared production context" icon={Layers3}>
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-white/[0.065] bg-white/[0.018] px-3 py-3">
            <div className="text-lg font-medium tracking-[-0.03em] text-white/76">{assetCount}</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.16em] text-white/24">Assets</div>
          </div>
          <div className="border border-white/[0.065] bg-white/[0.018] px-3 py-3">
            <div className="text-lg font-medium tracking-[-0.03em] text-white/76">{taskCount}</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.16em] text-white/24">Tasks</div>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-white/25">
          Brand, references, approved versions and project state stay attached to the production record as work moves between specialist studios.
        </p>
      </Section>

      {hasSelection ? (
        <>
          <Section eyebrow="Current selection">
            <Row label="Type" value={selectionType} />
            <Row label="Title" value={selection.title || selection.name} />
            <Row label="Status" value={selection.status} />
            {selection.metadata?.coverage_contract ? (
              <Row label="Coverage" value="Cinematic Coverage V1" />
            ) : null}
          </Section>

          {professionalProductionSelection ? (
            <Section eyebrow="Professional direction">
              <CinematicCoverageEditor
                type={selectionType}
                item={selection}
                onSave={editor.save}
                saving={editor.saving}
              />
            </Section>
          ) : (
            <Section eyebrow="Professional controls">
              <PropertyEditor item={selection} onSave={editor.save} />
            </Section>
          )}
        </>
      ) : (
        <Section eyebrow="Selection">
          <p className="text-[10px] leading-5 text-white/26">
            Select a project object when you need direct controls. Avantiqo keeps the project-level context visible even when nothing is selected.
          </p>
        </Section>
      )}
    </aside>
  );
}