"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  BadgeCheck,
  CircleStop,
  Disc3,
  Music2,
  Radio,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from "lucide-react";

const MASTERING_PROFILES = [
  { id: "streaming", label: "Streaming", detail: "-14 LUFS · -1 dBTP" },
  { id: "cinematic", label: "Cinematic", detail: "-16 LUFS · -1 dBTP" },
  { id: "broadcast", label: "Broadcast", detail: "-23 LUFS · -1 dBTP" },
  { id: "club", label: "Club", detail: "-9 LUFS · -0.8 dBTP" },
];

const KEYS = ["", "C major", "C minor", "D major", "D minor", "E major", "E minor", "F major", "F minor", "G major", "G minor", "A major", "A minor", "B major", "B minor"];

function text(value) {
  return String(value ?? "").trim();
}

function audioUrl(value, depth = 0) {
  if (!value || depth > 8) return "";
  if (typeof value === "string") {
    return /^(https?:\/\/|blob:|data:audio)/i.test(value) ? value : "";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => audioUrl(entry, depth + 1)).find(Boolean) || "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["audio_url", "audioUrl", "file_url", "fileUrl", "asset_url", "assetUrl", "playback_url", "playbackUrl", "url", "master_url", "masterUrl"]) {
    const resolved = audioUrl(value[key], depth + 1);
    if (resolved) return resolved;
  }
  for (const key of ["output", "raw", "result", "data", "files", "audio", "asset"]) {
    const resolved = audioUrl(value[key], depth + 1);
    if (resolved) return resolved;
  }
  return "";
}

function isAudioAsset(asset = {}) {
  const mime = text(asset.mime_type || asset.metadata?.mime_type).toLowerCase();
  const type = text(asset.asset_type || asset.previewType || asset.type).toLowerCase();
  const url = text(asset.url || asset.file_url).toLowerCase();
  return mime.startsWith("audio/") || type.includes("audio") || /\.(wav|mp3|m4a|aac|flac|ogg)(\?|$)/.test(url);
}

function directPlaybackUrl(asset = {}) {
  return audioUrl(asset.url || asset.file_url || asset.playback_url || asset);
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">{label}</span>
        {hint ? <span className="text-[10px] text-white/22">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function GateCard({ title, copy }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white/68">{title}</div>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-amber-100/65">
          Certification gate
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-white/32">{copy}</div>
    </div>
  );
}

export default function MusicWorkspace({ runtime }) {
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const organizationId = runtime.organizationId || null;
  const refresh = runtime.refresh;
  const audioAssets = useMemo(
    () => (runtime.assetRuntime?.items || []).filter(isAudioAsset).slice(0, 8),
    [runtime.assetRuntime?.items],
  );

  const [form, setForm] = useState({
    title: project?.name ? `${project.name} music` : "New composition",
    style: "cinematic electronic",
    mood: "premium, warm, intelligent",
    energy: "controlled build",
    instrumentation: "warm synths, restrained percussion, organic texture",
    structure: "short intro, evolving body, emotional lift, elegant resolution",
    duration_seconds: 30,
    bpm: 96,
    keyscale: "",
    timesignature: "4",
    instrumental: true,
    lyrics: "",
    vocal_language: "english",
    mastering_profile: "streaming",
  });
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playbackUrls, setPlaybackUrls] = useState({});
  const [resolvingAssets, setResolvingAssets] = useState({});

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function request(payload) {
    const response = await fetch("/api/creative/music/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Music Studio execution failed");
    }
    return result;
  }

  async function compose() {
    if (!organizationId) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "compose",
        organization_id: organizationId,
        creative_project_id: project?.id || null,
        creative_mission_id: mission?.id || null,
        ...form,
      });
      setSession({ ...result, quantity: Number(form.duration_seconds), unit: "second" });
      if (!result.pending) refresh?.();
    } catch (cause) {
      setError(cause?.message || "Music Studio execution failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!session?.pending || !session?.provider_job_id || !session?.usage_id || !organizationId) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const result = await request({
          action: "status",
          organization_id: organizationId,
          creative_project_id: project?.id || null,
          creative_mission_id: mission?.id || null,
          title: session?.session?.title || form.title,
          mastering_profile: session?.session?.mastering_profile || form.mastering_profile,
          provider: session.provider,
          provider_job_id: session.provider_job_id,
          usage_id: session.usage_id,
          pricing: session.pricing || {},
          credential_id: session.credential_id || null,
          started_at: session.started_at || null,
          quantity: session.quantity,
          unit: session.unit,
        });
        if (!cancelled) {
          setSession((current) => ({ ...current, ...result }));
          if (!result.pending) refresh?.();
        }
      } catch (cause) {
        if (!cancelled) setError(cause?.message || "Music job status failed");
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    session?.pending,
    session?.provider_job_id,
    session?.usage_id,
    session?.provider,
    session?.pricing,
    session?.credential_id,
    session?.started_at,
    session?.quantity,
    session?.unit,
    session?.session?.title,
    session?.session?.mastering_profile,
    organizationId,
    project?.id,
    mission?.id,
    form.title,
    form.mastering_profile,
    refresh,
  ]);

  useEffect(() => {
    if (!organizationId || !audioAssets.length) return undefined;
    let cancelled = false;
    const unresolved = audioAssets.filter((asset) => (
      asset?.id &&
      !directPlaybackUrl(asset) &&
      !playbackUrls[asset.id] &&
      !resolvingAssets[asset.id]
    ));
    if (!unresolved.length) return undefined;

    setResolvingAssets((current) => ({
      ...current,
      ...Object.fromEntries(unresolved.map((asset) => [asset.id, true])),
    }));

    Promise.all(unresolved.map(async (asset) => {
      try {
        const result = await request({
          action: "resolve_asset",
          organization_id: organizationId,
          asset_id: asset.id,
        });
        return [asset.id, audioUrl(result?.asset?.playback_url || result?.asset)];
      } catch {
        return [asset.id, ""];
      }
    })).then((entries) => {
      if (cancelled) return;
      setPlaybackUrls((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter(([, url]) => Boolean(url))),
      }));
      setResolvingAssets((current) => {
        const next = { ...current };
        for (const [id] of entries) delete next[id];
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId, audioAssets, playbackUrls, resolvingAssets]);

  const generatedUrl = audioUrl(session?.output);
  const activeMaster = MASTERING_PROFILES.find((profile) => profile.id === form.mastering_profile) || MASTERING_PROFILES[0];

  return (
    <div className="min-h-full bg-[#050505] text-white">
      <header className="border-b border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(214,166,106,0.1),transparent_34%)] px-6 py-7 lg:px-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#d6a66a]">
              <Music2 className="h-3.5 w-3.5" />
              Avantiqo Music · Owned Studio Engine
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Compose, shape and finish original music</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/42">
              Direct musical intent instead of writing provider prompts. Avantiqo converts the session into execution-only ACE-Step direction, routes it through governed wallet and usage controls, and keeps mastering targets ready for the finishing pipeline.
            </p>
          </div>
          <div className="grid gap-2 text-[10px] sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-emerald-100/75">
              <BadgeCheck className="mb-1 h-3.5 w-3.5" />
              Music generation certified
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-white/48">
              <Disc3 className="mb-1 h-3.5 w-3.5" />
              ACE-Step 1.5
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-white/48">
              <Radio className="mb-1 h-3.5 w-3.5" />
              Provider hidden
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <main className="border-r border-white/8 p-5 lg:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/28">Composition direction</div>
              <div className="mt-1 text-lg font-medium text-white/82">Musical intent</div>
            </div>
            <span className="rounded-full border border-[#d6a66a]/20 bg-[#d6a66a]/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[#e8c995]/75">
              No provider prompt box
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <input value={form.title} onChange={(event) => update("title", event.target.value)} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none focus:border-[#d6a66a]/35" />
            </Field>
            <Field label="Style / genre">
              <input value={form.style} onChange={(event) => update("style", event.target.value)} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none focus:border-[#d6a66a]/35" />
            </Field>
            <Field label="Mood">
              <input value={form.mood} onChange={(event) => update("mood", event.target.value)} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none focus:border-[#d6a66a]/35" />
            </Field>
            <Field label="Energy">
              <input value={form.energy} onChange={(event) => update("energy", event.target.value)} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none focus:border-[#d6a66a]/35" />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Instrumentation">
              <textarea value={form.instrumentation} onChange={(event) => update("instrumentation", event.target.value)} className="h-24 w-full resize-none rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm leading-6 outline-none focus:border-[#d6a66a]/35" />
            </Field>
            <Field label="Arrangement">
              <textarea value={form.structure} onChange={(event) => update("structure", event.target.value)} className="h-24 w-full resize-none rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm leading-6 outline-none focus:border-[#d6a66a]/35" />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Duration" hint="10–180 sec">
              <input type="number" min="10" max="180" value={form.duration_seconds} onChange={(event) => update("duration_seconds", Number(event.target.value))} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none" />
            </Field>
            <Field label="Tempo" hint="BPM">
              <input type="number" min="30" max="300" value={form.bpm} onChange={(event) => update("bpm", Number(event.target.value))} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none" />
            </Field>
            <Field label="Key">
              <select value={form.keyscale} onChange={(event) => update("keyscale", event.target.value)} className="w-full rounded-xl border border-white/9 bg-[#0a0a09] px-4 py-3 text-sm outline-none">
                {KEYS.map((key) => <option key={key || "auto"} value={key}>{key || "Auto"}</option>)}
              </select>
            </Field>
            <Field label="Meter">
              <select value={form.timesignature} onChange={(event) => update("timesignature", event.target.value)} className="w-full rounded-xl border border-white/9 bg-[#0a0a09] px-4 py-3 text-sm outline-none">
                <option value="4">4/4</option><option value="3">3/4</option><option value="6">6/8</option><option value="2">2/4</option>
              </select>
            </Field>
          </div>

          <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.018] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white/78">Performance mode</div>
                <div className="mt-1 text-xs text-white/30">Instrumental is the safest production-certified path. Vocal mode uses only lyrics you supply.</div>
              </div>
              <button type="button" onClick={() => update("instrumental", !form.instrumental)} className={`rounded-full border px-4 py-2 text-xs ${form.instrumental ? "border-[#d6a66a]/30 bg-[#d6a66a]/10 text-[#f0d6a4]" : "border-white/10 bg-white/[0.03] text-white/60"}`}>
                {form.instrumental ? "Instrumental" : "Vocals"}
              </button>
            </div>
            {!form.instrumental ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                <Field label="Language"><input value={form.vocal_language} onChange={(event) => update("vocal_language", event.target.value)} className="w-full rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm outline-none" /></Field>
                <Field label="Lyrics"><textarea value={form.lyrics} onChange={(event) => update("lyrics", event.target.value)} className="h-32 w-full resize-none rounded-xl border border-white/9 bg-white/[0.025] px-4 py-3 text-sm leading-6 outline-none" /></Field>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/72"><SlidersHorizontal className="h-4 w-4 text-[#d6a66a]" /> Mastering target</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MASTERING_PROFILES.map((profile) => (
                <button key={profile.id} type="button" onClick={() => update("mastering_profile", profile.id)} className={`rounded-xl border p-3 text-left ${form.mastering_profile === profile.id ? "border-[#d6a66a]/35 bg-[#d6a66a]/[0.08]" : "border-white/8 bg-white/[0.018]"}`}>
                  <div className="text-xs font-medium text-white/72">{profile.label}</div>
                  <div className="mt-1 text-[10px] text-white/28">{profile.detail}</div>
                </button>
              ))}
            </div>
          </div>

          {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100/80">{error}</div> : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || session?.pending} onClick={compose} className="inline-flex items-center gap-2 rounded-xl bg-[#d6a66a] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
              {session?.pending ? <AudioLines className="h-4 w-4 animate-pulse" /> : <WandSparkles className="h-4 w-4" />}
              {session?.pending ? "Composing…" : busy ? "Starting…" : "Compose music"}
            </button>
            <div className="text-xs text-white/28">{form.duration_seconds}s · {form.bpm} BPM · {activeMaster.label}</div>
          </div>
        </main>

        <aside className="p-5 lg:p-7">
          <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/28">Current session</div>
                <div className="mt-1 text-lg font-medium text-white/80">{session?.session?.title || form.title}</div>
              </div>
              {session?.pending ? <AudioLines className="h-5 w-5 animate-pulse text-[#d6a66a]" /> : session?.failed ? <CircleStop className="h-5 w-5 text-red-300/70" /> : generatedUrl ? <BadgeCheck className="h-5 w-5 text-emerald-300/70" /> : <Disc3 className="h-5 w-5 text-white/24" />}
            </div>

            <div className="mt-5 flex min-h-36 items-center justify-center rounded-xl border border-white/7 bg-black/40 p-4">
              {generatedUrl ? (
                <audio src={generatedUrl} controls className="w-full" />
              ) : session?.pending ? (
                <div className="text-center"><AudioLines className="mx-auto h-8 w-8 animate-pulse text-[#d6a66a]/75" /><div className="mt-3 text-sm text-white/48">Avantiqo Music is composing</div><div className="mt-1 text-xs text-white/24">Wallet reservation remains governed until settlement.</div></div>
              ) : session?.failed ? (
                <div className="text-center"><CircleStop className="mx-auto h-8 w-8 text-red-300/55" /><div className="mt-3 text-sm text-red-100/65">Composition did not complete</div><div className="mt-1 text-xs text-white/24">No failed output is stored as a project asset.</div></div>
              ) : (
                <div className="text-center"><Music2 className="mx-auto h-8 w-8 text-white/16" /><div className="mt-3 text-sm text-white/35">Your composition will appear here</div></div>
              )}
            </div>

            {session ? (
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-white/7 p-3"><div className="text-white/25">Status</div><div className="mt-1 text-white/65">{session.pending ? "Composing" : session.failed ? "Failed" : generatedUrl ? "Ready" : session.provider_status || "Processing"}</div></div>
                <div className="rounded-lg border border-white/7 p-3"><div className="text-white/25">Engine</div><div className="mt-1 text-white/65">Avantiqo Music</div></div>
                <div className="rounded-lg border border-white/7 p-3"><div className="text-white/25">Settlement</div><div className="mt-1 text-white/65">{session.settlement || "Governed"}</div></div>
                <div className="rounded-lg border border-white/7 p-3"><div className="text-white/25">Master target</div><div className="mt-1 text-white/65">{activeMaster.label}</div></div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.018] p-5">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#d6a66a]" /><div className="text-sm font-medium text-white/72">Studio finishing</div></div>
            <p className="mt-2 text-xs leading-5 text-white/32">The selected {activeMaster.label.toLowerCase()} profile is carried as a downstream Avantiqo Audio Finishing target. Multi-track mix, LUFS/true-peak validation, WAV/MP3 delivery and waveform reporting already exist in the finishing runtime.</p>
          </div>

          <div className="mt-5 space-y-2">
            <GateCard title="Remix / repaint" copy="Engine target exists, but it stays disabled until source-audio quality and GPU-economics certification are complete." />
            <GateCard title="Stem Lab" copy="Stem separation is a target capability, not yet a certified owned execution lane." />
            <GateCard title="Extend composition" copy="Continuation will unlock only with dedicated continuity and audio-quality benchmarks." />
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.018] p-5">
            <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium text-white/70">Project audio</div><span className="text-[10px] text-white/24">{audioAssets.length} recent</span></div>
            <div className="space-y-2">
              {audioAssets.map((asset) => {
                const url = directPlaybackUrl(asset) || playbackUrls[asset.id] || "";
                const resolving = Boolean(resolvingAssets[asset.id]);
                return (
                  <div key={asset.id} className="rounded-xl border border-white/7 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-xs text-white/60">{asset.title || asset.name || asset.file_name || "Audio asset"}</div>
                      {asset.metadata?.owned_engine ? <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-[#d6a66a]/55">Avantiqo</span> : null}
                    </div>
                    {url ? <audio src={url} controls className="mt-2 w-full" /> : resolving ? <div className="mt-2 flex items-center gap-2 text-[10px] text-white/26"><AudioLines className="h-3 w-3 animate-pulse" /> Securing private playback…</div> : <div className="mt-2 text-[10px] text-white/22">Playback unavailable</div>}
                  </div>
                );
              })}
              {!audioAssets.length ? <div className="rounded-xl border border-dashed border-white/8 p-4 text-center text-xs text-white/24">No project audio assets yet</div> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
