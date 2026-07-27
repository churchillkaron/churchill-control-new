"use client";

import { useState } from "react";

const DEFAULT_MODES = [
  { id: "ask", label: "Ask AI" },
  { id: "summarize", label: "Summarize" },
  { id: "validate", label: "Validate" },
];

export default function AIEngine({
  action,
  moduleKey,
  organizationId,
  entityId,
  periodId,
  context = {},
  onComplete,
  className = "",
  label = "AI",
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(action?.defaultMode || "ask");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!action || action.enabled === false || !action.capability) return null;

  const endpoint = action.endpoint || "/api/workspace/ai";
  const modes = Array.isArray(action.modes) && action.modes.length
    ? DEFAULT_MODES.filter(item => action.modes.includes(item.id))
    : DEFAULT_MODES;

  async function execute() {
    if (!prompt.trim() && mode === "ask") {
      alert("Enter a question or instruction.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        module: moduleKey,
        mode,
        prompt: prompt.trim(),
        action: action.action || action.id || mode,
        organizationId,
        organization_id: organizationId,
        entityId,
        entity_id: entityId,
        periodId,
        period_id: periodId,
        ...context,
      };

      const response = await fetch(endpoint, {
        method: action.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: action.capability,
          context: {
            organizationId,
            organization_id: organizationId,
            entityId,
            entity_id: entityId,
            periodId,
            period_id: periodId,
            moduleKey,
            ...context,
          },
          payload,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json.success === false) {
        throw new Error(json.error || json.message || "AI execution failed");
      }

      onComplete?.(json);
      setOpen(false);
      setPrompt("");
    } catch (error) {
      alert(error.message || "AI execution failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-5 text-white backdrop-blur-xl">
          <div className="w-full max-w-3xl rounded-[30px] border border-white/10 bg-[#090909] p-6 shadow-2xl shadow-black/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#D6A66A]">Workspace AI</div>
                <h2 className="mt-3 text-[30px] font-light tracking-[-0.05em]">
                  {action.title || action.label || "AI Assistant"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-[12px] text-white/60"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {modes.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={
                    mode === item.id
                      ? "rounded-xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-2 text-[12px] text-[#F2D3A0]"
                      : "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[12px] text-white/50"
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>

            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              placeholder="Ask about this workspace or give a specific instruction..."
              className="mt-6 h-52 w-full rounded-2xl border border-white/10 bg-black/35 p-4 text-[13px] text-white outline-none placeholder:text-white/25"
            />

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={execute}
                disabled={busy}
                className="rounded-xl bg-[#D6A66A] px-6 py-3 text-[13px] font-semibold text-black disabled:opacity-50"
              >
                {busy ? "Running..." : "Execute"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
