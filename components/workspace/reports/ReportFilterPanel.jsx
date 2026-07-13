"use client";

export default function ReportFilterPanel({
  filters,
  setFilters,
  onGenerate,
  busy,
}) {

  function update(name,value){
    setFilters(prev=>({
      ...prev,
      [name]:value,
    }));
  }


  return (
    <div className="grid gap-4 md:grid-cols-2">

      <div>
        <label className="text-xs text-white/40">
          From Date
        </label>
        <input
          type="date"
          value={filters.date_from || ""}
          onChange={e=>update("date_from",e.target.value)}
          className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white"
        />
      </div>


      <div>
        <label className="text-xs text-white/40">
          To Date
        </label>
        <input
          type="date"
          value={filters.date_to || ""}
          onChange={e=>update("date_to",e.target.value)}
          className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white"
        />
      </div>


      <div>
        <label className="text-xs text-white/40">
          Period
        </label>
        <input
          value={filters.period_id || ""}
          onChange={e=>update("period_id",e.target.value)}
          className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white"
        />
      </div>


      <div>
        <label className="text-xs text-white/40">
          Currency
        </label>
        <input
          value={filters.currency || ""}
          onChange={e=>update("currency",e.target.value)}
          className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white"
        />
      </div>


      <button
        disabled={busy}
        onClick={onGenerate}
        className="md:col-span-2 rounded-xl bg-amber-400 px-5 py-3 text-black font-semibold"
      >
        {busy ? "Generating..." : "Generate Report"}
      </button>

    </div>
  );
}
