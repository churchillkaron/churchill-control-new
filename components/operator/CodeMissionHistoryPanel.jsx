"use client";

import { History, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

const MAX_RESUMES = 24;

function text(value) {
  return String(value ?? "").trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanStatus(value) {
  const normalized = text(value).replaceAll("_", " ").toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CodeMissionHistoryPanel({
  organizationId,
  compact = false,
  disabled = false,
}) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState(null);

  async function loadSessions() {
    if (!organizationId) return;
    try {
      setLoading(true);
      const response = await fetch(
        `/api/operator/code/history?organizationId=${encodeURIComponent(organizationId)}&limit=${compact ? 5 : 20}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) {
        throw new Error(body?.error || "Could not load Code mission history");
      }
      setSessions(Array.isArray(body.sessions) ? body.sessions : []);
    } catch (loadError) {
      setError(loadError?.message || "Could not load Code mission history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, [organizationId]);

  async function inspectMission(missionId) {
    if (!organizationId || !missionId) return;
    try {
      setError(null);
      const response = await fetch(
        `/api/operator/code/history?organizationId=${encodeURIComponent(organizationId)}&missionId=${encodeURIComponent(missionId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true || !body?.found) {
        throw new Error(body?.error || "Code mission history detail unavailable");
      }
      setSelected(body.session || null);
    } catch (inspectError) {
      setError(inspectError?.message || "Code mission history detail unavailable");
    }
  }

  async function resumeMission(session) {
    if (!session?.mission_id || disabled || resuming || session.resumable !== true) return;
    setResuming(true);
    setError(null);
    let resumeState = null;
    try {
      for (let attempt = 0; attempt < MAX_RESUMES; attempt += 1) {
        const payload = attempt === 0
          ? {
              organizationId,
              resume_mission_id: session.mission_id,
              reasoning_call_budget: 4,
              max_employee_passes: 8,
            }
          : {
              organizationId,
              objective: session.objective,
              repository_url: session.repository_url,
              ref: session.ref || "main",
              execution_key: session.execution_key,
              resume_state: resumeState,
              reasoning_call_budget: 4,
              max_employee_passes: 8,
            };
        const response = await fetch("/api/operator/code/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Code mission resume failed (${response.status})`);
        if (body.resume_required === true && body.resume_state) {
          resumeState = body.resume_state;
          await wait(1400);
          continue;
        }
        await loadSessions();
        if (selected?.mission_id === session.mission_id) await inspectMission(session.mission_id);
        return;
      }
      throw new Error("Code mission resume limit reached");
    } catch (resumeError) {
      setError(resumeError?.message || "Code mission resume failed");
    } finally {
      setResuming(false);
    }
  }

  return (
    <section
      data-avantiqo-code-mission-history="true"
      className={compact
        ? "border-t border-black/[0.07] bg-white px-5 py-4"
        : "rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-6"}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={compact
            ? "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#9A744B]"
            : "flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#D6A66A]"}
          >
            <History size={11} />
            Code mission history
          </div>
          <div className={compact ? "mt-1 text-[11px] text-[#77716A]" : "mt-1 text-sm text-white/55"}>
            Reopen verified engineering context and continue the same attested mission.
          </div>
        </div>
        <span className={compact ? "text-[9px] text-[#9A958D]" : "text-[10px] text-white/30"}>
          {sessions.length} saved
        </span>
      </div>

      {loading ? (
        <div className={compact ? "mt-3 text-[10px] text-[#9A958D]" : "mt-4 text-xs text-white/35"}>Loading history…</div>
      ) : sessions.length ? (
        <div className="mt-4 space-y-2">
          {sessions.map((session) => (
            <button
              key={session.mission_id}
              type="button"
              onClick={() => inspectMission(session.mission_id)}
              className={compact
                ? "w-full rounded-lg border border-black/[0.07] bg-[#FBFAF8] px-3 py-2 text-left transition hover:border-[#9A744B]/25"
                : "w-full rounded-xl border border-white/8 bg-black/20 px-3.5 py-3 text-left transition hover:border-[#D6A66A]/25"}
            >
              <div className={compact ? "truncate text-[11px] font-medium text-[#37332E]" : "truncate text-sm text-white/70"}>
                {session.objective || "Code mission"}
              </div>
              <div className={compact ? "mt-1 flex gap-3 text-[9px] text-[#9A958D]" : "mt-1 flex flex-wrap gap-3 text-[10px] text-white/30"}>
                <span>{humanStatus(session.status)}</span>
                <span>{session.file_count || 0} files</span>
                <span>{session.verification_passed ? "verified" : "not verified"}</span>
                <span>{session.resumable ? "resumable" : "closed"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className={compact ? "mt-3 text-[10px] text-[#9A958D]" : "mt-4 text-xs text-white/35"}>No saved Code missions yet.</div>
      )}

      {selected ? (
        <div className={compact
          ? "mt-4 rounded-lg border border-[#9A744B]/15 bg-[#FBFAF8] p-3"
          : "mt-5 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-4"}
        >
          <div className={compact ? "text-[10px] font-medium text-[#37332E]" : "text-sm text-white/75"}>{selected.objective}</div>
          <div className={compact ? "mt-2 flex flex-wrap gap-3 text-[9px] text-[#8F8A82]" : "mt-2 flex flex-wrap gap-4 text-[10px] text-white/35"}>
            <span>{selected.file_count || 0} files</span>
            <span>{selected.test_count || 0} tests</span>
            <span>{selected.interventions?.length || 0} interventions</span>
            <span>{selected.verification_passed ? "verified" : "verification incomplete"}</span>
          </div>
          {selected.files_changed?.length ? (
            <div className={compact ? "mt-2 font-mono text-[9px] text-[#77716A]" : "mt-3 font-mono text-[10px] text-white/40"}>
              {selected.files_changed.slice(0, 5).join(" · ")}
            </div>
          ) : null}
          {selected.patch ? (
            <details className="mt-3">
              <summary className={compact ? "cursor-pointer text-[9px] text-[#8B663E]" : "cursor-pointer text-[10px] text-[#D6A66A]/70"}>Final diff</summary>
              <pre className={compact
                ? "mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 font-mono text-[9px] leading-4 text-[#6F6A63]"
                : "mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-[10px] leading-5 text-white/45"}
              >{selected.patch}</pre>
            </details>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              data-avantiqo-resume-code-mission="true"
              type="button"
              onClick={() => resumeMission(selected)}
              disabled={disabled || resuming || selected.resumable !== true}
              className={compact
                ? "inline-flex items-center gap-1.5 rounded-lg border border-[#9A744B]/20 bg-white px-2.5 py-1.5 text-[9px] font-medium text-[#8B663E] disabled:opacity-35"
                : "inline-flex items-center gap-1.5 rounded-lg border border-[#D6A66A]/30 px-3 py-2 text-[10px] text-[#e7c497] disabled:opacity-35"}
            >
              {resuming ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
              {resuming ? "Resuming…" : "Continue mission"}
            </button>
            <span className={compact ? "inline-flex items-center gap-1 text-[8px] text-[#9A958D]" : "inline-flex items-center gap-1 text-[9px] text-white/28"}>
              <ShieldCheck size={9} /> attested · no commit · no deploy
            </span>
          </div>
          {!selected.resumable && selected.resume_blocker ? (
            <div className={compact ? "mt-2 text-[9px] text-[#9A958D]" : "mt-2 text-[10px] text-white/30"}>{selected.resume_blocker}</div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className={compact ? "mt-3 text-[9px] text-red-700/70" : "mt-3 text-[10px] text-red-200/70"}>{error}</div> : null}
    </section>
  );
}
