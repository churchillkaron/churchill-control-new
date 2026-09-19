"use client";
import { GitCompare, History, RotateCcw } from "lucide-react";

function stamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function ImageStudioVersionHistoryPanel({ workspace }) {
  const boardId = workspace.selection.artboard_id;
  const versions = workspace.versions
    .filter((item) => item.artboard_id === boardId)
    .sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0));
  if (!versions.length) return null;
  return <section className="mt-5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.22em] text-[#948D84]"><History className="h-3 w-3" /> Version history</div>
      <span className="text-[8px] text-[#AAA49C]">Immutable</span>
    </div>
    <div className="mt-2 space-y-1.5">      {versions.map((version) => <div key={version.id} className="rounded-lg border border-[#E5E1DA] bg-[#FBFAF8] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-[10px] font-medium text-[#625D56]">v{version.version_number}</div><div className="mt-0.5 text-[8px] text-[#A09A92]">{stamp(version.created_at)}</div></div>
          <span className="rounded border border-[#E2DED7] px-1.5 py-0.5 text-[7px] uppercase tracking-[.12em] text-[#A09A92]">{version.status || "WORKING"}</span>
        </div>
        {version.summary ? <div className="mt-2 text-[8px] leading-4 text-[#918B83]">{version.summary}</div> : null}
        {version.based_on_version_id ? <div className="mt-1 text-[7px] text-[#D6A66A]/45">Based on {String(version.based_on_version_id).slice(0, 8)}</div> : null}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => { workspace.setCompareVersion(version.id); if (!workspace.ui.compare) workspace.toggleCompare(); }} className="flex items-center justify-center gap-1 rounded-md border border-[#DDD8D0] px-2 py-1.5 text-[8px] text-[#817A72] hover:text-[#5E5952]"><GitCompare className="h-3 w-3" />Compare</button>
          <button type="button" onClick={() => workspace.restoreVersionAsDraft(version)} className="flex items-center justify-center gap-1 rounded-md border border-[#D6A66A]/18 bg-[#D6A66A]/[.04] px-2 py-1.5 text-[8px] text-[#D6A66A]/75 hover:text-[#D6A66A]"><RotateCcw className="h-3 w-3" />Restore copy</button>
        </div>
      </div>)}
    </div>
  </section>;
}
