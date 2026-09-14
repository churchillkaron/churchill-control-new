"use client";

export default function ImageStudioConflictBanner({ persistence }) {
  const conflict = persistence?.conflict;
  if (!conflict) return null;

  return <div className="shrink-0 border-b border-amber-300/15 bg-amber-300/[0.045] px-4 py-3 lg:px-5">
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Newer studio changes detected</div>
        <div className="mt-1 text-[10px] leading-5 text-white/42">Your unsaved local draft is preserved. Avantiqo will not overwrite the newer server version.</div>
      </div>
      <button type="button" onClick={() => void persistence.reloadLatestAfterConflict()} className="rounded-md border border-white/[0.08] bg-black/25 px-3 py-1.5 text-[9px] text-white/55">Reload latest</button>
      <button type="button" onClick={() => persistence.restoreConflictDraftAsCopy()} className="rounded-md border border-[#D6A66A]/25 bg-[#D6A66A]/[0.07] px-3 py-1.5 text-[9px] text-[#D6A66A]">Restore local as copy</button>
    </div>
  </div>;
}
