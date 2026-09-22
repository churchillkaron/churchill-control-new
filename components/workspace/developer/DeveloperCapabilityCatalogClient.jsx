"use client";
import { useMemo, useState } from "react";

export default function DeveloperCapabilityCatalogClient({ capabilities = [] }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("all");
  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => capabilities.filter((capability) => {
    if (mode === "read" && !capability.readOnly) return false;
    if (mode === "write" && capability.readOnly) return false;
    if (!normalized) return true;
    const haystack = [
      capability.id,
      capability.name,
      capability.group,
      capability.description,
      capability.boundary,
      ...(capability.commands || []),
      ...(capability.events || []),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(normalized);
  }), [capabilities, mode, normalized]);

  const groups = useMemo(() => {
    const out = {};
    for (const capability of filtered) {
      if (!out[capability.group]) out[capability.group] = [];
      out[capability.group].push(capability);
    }
    return out;
  }, [filtered]);

  return <div>
    <div className="mb-4 flex flex-col gap-3 rounded-[20px] border border-black/[.07] bg-white p-4 md:flex-row md:items-center">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search capability, command, event or boundary…"
        className="min-w-0 flex-1 rounded-xl border border-black/[.08] bg-[#FCFAF7] px-4 py-3 text-[10px] outline-none focus:border-[#B7793B]/40"
      />
      <div className="flex gap-2">
        {[["all","All"],["read","Read only"],["write","Writable"]].map(([value,label]) => <button
          key={value}
          onClick={() => setMode(value)}
          className={"rounded-lg border px-3 py-2 text-[8px] font-semibold " + (mode === value ? "border-[#B7793B]/35 bg-[#F1E2CF] text-[#6F4828]" : "border-black/[.07] bg-[#FAF8F5] text-[#71685F]")}
        >{label}</button>)}
      </div>
      <div className="text-[9px] text-[#8B8177]">{filtered.length} / {capabilities.length}</div>
    </div>

    <div className="space-y-4">
      {Object.entries(groups).map(([group, items]) => <section key={group} className="overflow-hidden rounded-[22px] border border-black/[.07] bg-white">
        <div className="flex items-center justify-between bg-[#F7F2EA] px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#76502E]">{group}</div>
          <div className="text-[9px] text-[#8C837A]">{items.length} capabilities</div>
        </div>
        <div className="divide-y divide-black/[.055]">{items.map((capability) => <div key={capability.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold">{capability.name}</span>
              <span className="rounded-full bg-[#F2ECE4] px-2 py-1 font-mono text-[8px] text-[#725E4A]">{capability.id}</span>
              {capability.readOnly ? <span className="rounded-full bg-[#EEF3EC] px-2 py-1 text-[7px] font-semibold text-[#55705A]">READ ONLY</span> : null}
            </div>
            <p className="mt-2 text-[9px] leading-5 text-[#776F67]">{capability.description}</p>
            {capability.boundary ? <p className="mt-2 text-[8px] leading-4 text-[#9A684A]">Boundary: {capability.boundary}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#9A9085]">Commands</div>
              <div className="mt-2 flex flex-wrap gap-1">{capability.commands.map((command)=><span key={command} className="rounded-md border border-black/[.06] bg-[#FBF9F6] px-2 py-1 font-mono text-[7px]">{command}</span>)}</div>
            </div>
            <div>
              <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#9A9085]">Endpoint</div>
              <div className="mt-2 break-all rounded-lg bg-[#1D1A17] px-3 py-2 font-mono text-[8px] text-[#E8D2B4]">{capability.listEndpoint}</div>
            </div>
          </div>
        </div>)}</div>
      </section>)}
      {!filtered.length ? <div className="rounded-[20px] border border-black/[.07] bg-white p-8 text-center text-[10px] text-[#8B8177]">No capabilities match this filter.</div> : null}
    </div>
  </div>;
}
