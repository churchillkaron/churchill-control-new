"use client";

import { useState } from "react";

function resultMessage(result = {}) {
  if (result.next_action === "REVIEW_AND_APPROVE_PRODUCTION_DOSSIER") {
    return "Production plan and exact cost are ready for approval.";
  }
  if (result.status === "ALREADY_COMPLETED") {
    return "This production is already complete.";
  }
  return result.status
    ? `Creative Studio: ${String(result.status).replaceAll("_", " ").toLowerCase()}.`
    : "Creative production started.";
}

export default function Header({
  runtime,
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
            placeholder="Tell Avantiqo what to create — e.g. Make a 10-second Facebook video for Churchill"
            aria-label="Creative command"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={submitting || !intent.trim()}
            className="shrink-0 rounded-xl border border-[#c8a96a]/40 bg-[#b48a45]/15 px-5 py-2 text-sm font-medium text-[#e2c681] transition hover:bg-[#b48a45]/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Creating..." : "Create"}
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
