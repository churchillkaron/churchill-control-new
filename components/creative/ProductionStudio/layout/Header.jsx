"use client";

import { useState } from "react";

function awaitingProductionApproval(result = {}) {
  return (
    result.next_action === "REVIEW_AND_APPROVE_PRODUCTION_DOSSIER" ||
    result.execution?.status === "AWAITING_PRODUCTION_DOSSIER_APPROVAL" ||
    (
      result.execution?.approval?.required === true &&
      result.execution?.approval?.scope === "PRODUCTION_DOSSIER"
    )
  );
}

function resultMessage(result = {}) {
  if (awaitingProductionApproval(result)) {
    return "Production plan and exact cost are ready for approval. No provider execution has started.";
  }
  if (result.status === "ALREADY_COMPLETED") {
    return "This production is already complete.";
  }
  return result.status
    ? `Creative Studio: ${String(result.status).replaceAll("_", " ").toLowerCase()}.`
    : "Creative production prepared.";
}

export default function Header({
  runtime,
  editor,
}) {
  const commands = runtime.commands || [];
  const [intent, setIntent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createFromIntent(event) {
    event.preventDefault();
    const request = intent.trim();
    if (!request || submitting) return;
    if (!runtime.organizationId) {
      setError("Select an organization before creating production.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/creative/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          intent: request,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(
          result.error ||
          result.reason ||
          "Creative command failed",
        );
      }

      setMessage(resultMessage(result));
      setIntent("");

      if (awaitingProductionApproval(result)) {
        editor?.setActiveWorkspace?.("production");
      }

      await runtime.refresh?.();
    } catch (commandError) {
      setError(commandError?.message || String(commandError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <header className="border-b border-white/10 bg-[#080808]">
      <div className="space-y-4 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.30em] text-[#c8a96a]">
              Creative Studio
            </div>
            <div className="truncate text-xl font-semibold">
              {runtime.workspace?.title || "Creative Workspace"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {commands.map((command) => (
              <button
                key={command.id}
                type="button"
                onClick={command.onClick}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10"
              >
                {command.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={createFromIntent}
          className="flex items-center gap-3 rounded-2xl border border-[#c8a96a]/25 bg-black/40 p-2"
        >
          <input
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="Tell Avantiqo the outcome — it will research, plan, create and stop for approval before governed execution"
            aria-label="Creative command"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={submitting || !intent.trim()}
            className="shrink-0 rounded-xl border border-[#c8a96a]/40 bg-[#b48a45]/15 px-5 py-2 text-sm font-medium text-[#e2c681] transition hover:bg-[#b48a45]/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Directing..." : "Create"}
          </button>
        </form>

        {message ? (
          <p className="text-xs text-emerald-300">{message}</p>
        ) : null}
        {error ? (
          <p className="text-xs text-red-300">{error}</p>
        ) : null}
      </div>
    </header>
  );
}
