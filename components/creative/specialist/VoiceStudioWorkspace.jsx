"use client";

import { useMemo, useState } from "react";
import {
  AudioLines,
  FileText,
  Mic2,
  PlayCircle,
  Volume2,
} from "lucide-react";

function audioUrl(asset) {
  return asset?.audio_url || asset?.file_url || asset?.uri || asset?.url || "";
}

function looksLikeAudio(asset) {
  const type = String(asset?.asset_type || asset?.mime_type || asset?.type || "").toLowerCase();
  const url = audioUrl(asset).toLowerCase();
  return type.includes("audio") || type.includes("voice") || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(url);
}

function takeLabel(asset, index) {
  return asset?.title || asset?.name || asset?.file_name || `Take ${index + 1}`;
}

function transcriptOf(asset, brief) {
  const metadata = asset?.metadata || {};
  const analysis = asset?.analysis || {};
  return (
    metadata.transcript ||
    metadata.script ||
    metadata.text ||
    analysis.transcript ||
    analysis.text ||
    brief?.data?.script ||
    brief?.metadata?.script ||
    brief?.communication_goal ||
    brief?.creative_objective ||
    "No transcript or script is attached to this take yet."
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="border-b border-white/[0.055] py-3 last:border-b-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-white/24">{label}</div>
      <div className="mt-1.5 break-words text-[11px] leading-5 text-white/58">{value || "—"}</div>
    </div>
  );
}

export default function VoiceStudioWorkspace({ runtime }) {
  const takes = useMemo(
    () => (runtime.assetRuntime?.items || []).filter(looksLikeAudio),
    [runtime.assetRuntime?.items],
  );
  const [selectedId, setSelectedId] = useState(takes[0]?.id || null);
  const selected = takes.find((item) => item.id === selectedId) || takes[0] || null;
  const brief = runtime.briefRuntime?.current || null;
  const transcript = transcriptOf(selected, brief);
  const source = audioUrl(selected);

  return (
    <div className="grid h-full min-h-0 bg-[#050505] lg:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)_300px]">
      <aside className="min-h-0 overflow-y-auto border-r border-white/[0.08] bg-[#080807] p-3">
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/26">Takes</div>
            <div className="mt-1 text-[11px] text-white/38">{takes.length} recorded/generated take{takes.length === 1 ? "" : "s"}</div>
          </div>
          <Mic2 className="h-4 w-4 text-[#D6A66A]/55" />
        </div>

        <div className="space-y-1.5">
          {takes.map((take, index) => {
            const active = selected?.id === take.id;
            return (
              <button
                key={take.id || index}
                type="button"
                onClick={() => setSelectedId(take.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.07]" : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.025]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-[11px] font-medium text-white/68">{takeLabel(take, index)}</div>
                  <PlayCircle className="h-3.5 w-3.5 shrink-0 text-white/20" />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[9px] text-white/26">
                  <span>{take.approval_state || take.status || "take"}</span>
                  {take.provider ? <><span>·</span><span>{take.provider}</span></> : null}
                </div>
              </button>
            );
          })}

          {!takes.length ? (
            <div className="rounded-xl border border-dashed border-white/[0.09] px-4 py-8 text-center text-[11px] leading-5 text-white/28">
              No voice/audio takes are attached to the active creative project yet.
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-white/[0.07] bg-[#070706] px-4 py-3 lg:px-5">
          <div className="text-sm font-medium text-white/78">{selected ? takeLabel(selected, 0) : "Voice session"}</div>
          <div className="mt-0.5 text-[10px] text-white/27">Playback, transcript and take review</div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
          <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#080807] p-5 lg:p-6">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]/65">
                <Volume2 className="h-4 w-4" /> Waveform / playback
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07] bg-black/50 p-4">
                <div className="flex h-28 items-center gap-[3px] overflow-hidden" aria-hidden="true">
                  {Array.from({ length: 88 }).map((_, index) => {
                    const height = 16 + ((index * 37) % 72);
                    return <span key={index} className="w-[2px] shrink-0 rounded-full bg-[#D6A66A]/35" style={{ height: `${height}%` }} />;
                  })}
                </div>
                {source ? (
                  <audio controls preload="metadata" src={source} className="mt-3 w-full" />
                ) : (
                  <div className="mt-3 text-center text-[11px] text-white/25">No playable audio source selected.</div>
                )}
              </div>
            </section>

            <section className="min-h-[280px] rounded-2xl border border-white/[0.08] bg-[#080807] p-5 lg:p-6">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]/65">
                <FileText className="h-4 w-4" /> Script / transcript
              </div>
              <div className="mt-4 whitespace-pre-wrap text-[14px] leading-7 text-white/70">{transcript}</div>
            </section>
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-white/[0.08] bg-[#080807] p-4 2xl:block">
        <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]/62">
          <AudioLines className="h-4 w-4" /> Take properties
        </div>
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-4">
          <MetaRow label="Name" value={selected?.title || selected?.name || selected?.file_name} />
          <MetaRow label="Status" value={selected?.status} />
          <MetaRow label="Approval" value={selected?.approval_state} />
          <MetaRow label="Provider" value={selected?.provider || selected?.engine} />
          <MetaRow label="MIME type" value={selected?.mime_type} />
          <MetaRow label="Language" value={selected?.metadata?.language || selected?.analysis?.language} />
          <MetaRow label="Voice" value={selected?.metadata?.voice_name || selected?.metadata?.voice_id} />
          <MetaRow label="Duration" value={selected?.metadata?.duration_seconds ? `${selected.metadata.duration_seconds}s` : null} />
        </div>
      </aside>
    </div>
  );
}
