export default function StaffPortalHeroArt() {
  return (
    <div className="relative min-h-[720px] overflow-hidden rounded-[30px] border border-black/[.09] bg-[#EEE6DA] shadow-[0_32px_90px_rgba(69,50,31,.14)] sm:min-h-[590px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(214,166,106,.22),transparent_34%),linear-gradient(145deg,#FAF6EF,#E8DDD0)]" />
      <div className="absolute inset-[18px] overflow-hidden rounded-[22px] border border-black/[.08] bg-[#F8F5EF] shadow-[0_18px_50px_rgba(58,42,26,.10)]">
        <div className="flex h-12 items-center border-b border-black/[.07] bg-[#F2EAE0] px-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#9A6531]">AVANTIQO STAFF PORTAL</div>
            <div className="mt-0.5 text-[6px] text-[#887D71]">One employee record · staff + owner + HR</div>
          </div>
          <div className="ml-auto rounded-full border border-[#B7793B]/25 bg-[#F3E3CE] px-3 py-1.5 text-[6px] font-semibold text-[#7D5632]">PRIVATE IDENTITY + WORK CONTEXT</div>
        </div>

        <div className="grid h-[655px] grid-cols-1 sm:h-[527px] sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-[16px] border border-black/[.07] bg-white p-4">
                <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#9A6531]">Today</div>
                <div className="mt-3 text-[18px] font-semibold tracking-[-.03em] text-[#2E2924]">Good morning, Maya.</div>
                <div className="mt-1 text-[7px] text-[#837A71]">Restaurant team · Patong location</div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    ["Shift","14:00–22:00"],
                    ["Clock","Ready"],
                    ["Requests","1 open"],
                    ["Payslip","Available"],
                  ].map(([a,b])=><div key={a} className="rounded-lg bg-[#F7F2EB] p-2.5"><div className="text-[5px] uppercase tracking-[.1em] text-[#9A9086]">{a}</div><div className="mt-1 text-[8px] font-semibold text-[#554D45]">{b}</div></div>)}
                </div>
              </div>

              <div className="rounded-[16px] border border-black/[.07] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#9A6531]">Identity & security</div>
                  <div className="rounded-full bg-[#E5ECE3] px-2 py-1 text-[5px] font-semibold text-[#4D6B51]">VERIFIED</div>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    ["Email","Verified"],
                    ["Phone","Verified"],
                    ["Passport","Valid · 214 days"],
                    ["Work permit","Valid · 91 days"],
                  ].map(([a,b],i)=><div key={a} className={"flex items-center justify-between rounded-lg px-2.5 py-2 "+(i===3?"bg-[#F8EEDD]":"bg-[#F7F2EB]")}><span className="text-[6px] text-[#756C63]">{a}</span><span className={"text-[6px] font-semibold "+(i===3?"text-[#95632E]":"text-[#4F6D53]")}>{b}</span></div>)}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[16px] border border-black/[.07] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#9A6531]">Private documents</div>
                <div className="ml-auto rounded-full border border-black/[.07] bg-[#F6F0E7] px-2 py-1 text-[5px] text-[#776D64]">restricted storage</div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["Passport","Verified","Expires 23 Apr 2027"],
                  ["National ID","Optional","No active record"],
                  ["Work permit","Verified","Legal employer bound"],
                ].map(([a,b,c])=><div key={a} className="rounded-xl border border-black/[.06] bg-[#FAF7F2] p-3">
                  <div className="text-[7px] font-semibold text-[#4B433C]">{a}</div>
                  <div className="mt-2 text-[6px] font-semibold text-[#9A6531]">{b}</div>
                  <div className="mt-1 text-[6px] leading-3 text-[#8A8076]">{c}</div>
                </div>)}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["My work","Assignments · checklists · service context"],
                ["My time","Shifts · attendance · leave · swaps"],
                ["My pay","Compensation context · payroll · payslips"],
              ].map(([a,b])=><div key={a} className="rounded-xl border border-black/[.06] bg-[#F4EEE6] p-3"><div className="text-[7px] font-semibold text-[#8E6037]">{a}</div><div className="mt-1 text-[6px] leading-3 text-[#776E65]">{b}</div></div>)}
            </div>
          </div>

          <aside className="hidden border-l border-black/[.07] bg-[#ECE3D7] p-3 sm:block">
            <div className="text-[7px] font-semibold uppercase tracking-[.15em] text-[#817468]">Owner / HR</div>
            <div className="mt-3 space-y-2">
              {[
                ["Employee master","Identity + employment + access"],
                ["Visual review","Passport / ID / work permit"],
                ["Expiry attention","Valid · expiring · expired"],
                ["Legal employer","Entity-bound work eligibility"],
                ["Workforce","Schedule · attendance · requests"],
                ["Payroll context","Compensation + payslips"],
              ].map(([a,b],i)=><div key={a} className={"rounded-xl border p-3 "+(i===2?"border-[#B7793B]/25 bg-[#F6E8D5]":"border-black/[.07] bg-white/45")}><div className="text-[7px] font-semibold text-[#8B623B]">{a}</div><div className="mt-1 text-[6px] leading-3 text-[#71675E]">{b}</div></div>)}
            </div>
            <div className="mt-4 rounded-xl border border-black/[.07] bg-[#1D1A17] p-3 text-white">
              <div className="text-[6px] uppercase tracking-[.13em] text-[#D6A66A]">One record</div>
              <div className="mt-2 text-[7px] leading-4 text-white/55">The staff member, legal employer, private documents, validity, work and pay context stay connected.</div>
            </div>
          </aside>
        </div>
      </div>
      <div className="absolute left-8 top-8 rounded-full border border-white/70 bg-[#F8F1E8]/88 px-4 py-2 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8D6339] shadow-sm backdrop-blur-xl">STAFF · HR · OWNER · ONE RECORD</div>
    </div>
  );
}
