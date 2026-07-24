"use client";

import RunCreativePipelineButton from "../actions/RunCreativePipelineButton";

export default function Header({
  runtime,
  editor,
}) {
  const commands = runtime.commands || [];
  const hasProject = Boolean(runtime.projectRuntime?.current?.id);
  const productionActive = editor?.activeWorkspace === "production";

  function openProductionControl() {
    editor?.setActiveWorkspace?.("production");
  }

  return (
    <header className="border-b border-white/10 bg-[#080808]">
      <div className="flex min-h-16 items-center justify-between gap-6 px-6 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.30em] text-[#c8a96a]">
            Creative Studio
          </div>
          <div className="truncate text-xl font-semibold">
            {runtime.workspace?.title || "Creative Workspace"}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {commands.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={command.onClick}
              disabled={!command.onClick}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {command.label}
            </button>
          ))}

          {hasProject ? (
            <button
              type="button"
              onClick={openProductionControl}
              className={[
                "rounded-xl border px-4 py-2 text-sm transition",
                productionActive
                  ? "border-[#c8a96a]/50 bg-[#c8a96a]/20 text-[#f0d89a]"
                  : "border-[#c8a96a]/25 bg-[#c8a96a]/10 text-[#d8bd7a] hover:bg-[#c8a96a]/20",
              ].join(" ")}
            >
              Production Control
            </button>
          ) : null}

          {hasProject ? (
            <RunCreativePipelineButton
              runtime={runtime}
              editor={editor}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
