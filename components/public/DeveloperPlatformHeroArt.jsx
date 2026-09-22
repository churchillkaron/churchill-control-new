export default function DeveloperPlatformHeroArt() {
  const nav = ["Overview","Capabilities","API Explorer","Credentials","Webhooks","Logs","Usage"];
  return (
    <div className="relative min-h-[760px] overflow-hidden rounded-[30px] border border-black/[.09] bg-[#EDE4D7] shadow-[0_32px_90px_rgba(69,50,31,.14)] sm:min-h-[575px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(214,166,106,.24),transparent_34%),linear-gradient(145deg,#FAF6EF,#E7DDD0)]" />
      <div className="absolute inset-[18px] overflow-hidden rounded-[22px] border border-black/[.08] bg-[#F8F5EF] shadow-[0_18px_50px_rgba(58,42,26,.11)]">
        <div className="flex h-12 items-center border-b border-black/[.07] bg-[#F1E9DE] px-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#9A6531]">AVANTIQO DEVELOPERS</div>
            <div className="mt-0.5 text-[6px] text-[#887D71]">Organization-scoped developer control plane</div>
          </div>
          <div className="ml-auto rounded-full border border-[#B7793B]/25 bg-[#F3E3CE] px-3 py-1.5 text-[6px] font-semibold text-[#7D5632]">PRODUCTION BOUNDARIES ON</div>
        </div>

        <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-black/[.07] bg-white/55 px-2">
          {nav.map((item,i)=><div key={item} className={"whitespace-nowrap rounded-md px-2 py-1 text-[6px] "+(i===2?"bg-[#1D1A17] text-white":"text-[#7C7269]")}>{item}</div>)}
        </div>

        <div className="grid h-[665px] grid-cols-1 sm:h-[474px] sm:grid-cols-[150px_minmax(0,1fr)]">
          <aside className="hidden border-r border-black/[.07] bg-[#EEE6DB] p-3 sm:block">
            <div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#88796B]">Environment</div>
            <div className="mt-3 rounded-xl border border-[#B7793B]/25 bg-[#F4E4D1] p-3">
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#5C7D61]"/><span className="text-[8px] font-semibold text-[#4C433B]">Production</span></div>
              <div className="mt-2 text-[6px] text-[#8A7E72]">ACTIVE · scoped</div>
            </div>
            <div className="mt-2 rounded-xl border border-black/[.07] bg-white/48 p-3">
              <div className="text-[7px] font-semibold text-[#5B524A]">Development</div>
              <div className="mt-1 text-[6px] text-[#9B9085]">read-only</div>
            </div>
            <div className="mt-5 text-[7px] font-semibold uppercase tracking-[.14em] text-[#88796B]">Machine identity</div>
            <div className="mt-2 rounded-lg border border-black/[.07] bg-white/55 p-2.5">
              <div className="text-[7px] font-semibold text-[#5B524A]">website-production</div>
              <div className="mt-1 font-mono text-[6px] text-[#9B9085]">avq_prod_••••19c4</div>
              <div className="mt-2 rounded-full bg-[#E2EBDD] px-2 py-1 text-center text-[5px] font-semibold text-[#4E6A52]">ACTIVE</div>
            </div>
            <div className="mt-4 text-[6px] leading-4 text-[#9A8F84]">Least privilege<br/>Rotation tracked<br/>Last used 2m ago</div>
          </aside>

          <div className="min-w-0 p-2.5 sm:p-3">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
              <div className="rounded-[16px] border border-black/[.07] bg-white p-4">
                <div className="flex items-center gap-2">
                  <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#9A6531]">API Explorer</div>
                  <div className="ml-auto rounded-full bg-[#E6EDE4] px-2 py-1 text-[5px] font-semibold text-[#4B684F]">200 OK</div>
                </div>
                <div className="mt-3 rounded-lg border border-black/[.06] bg-[#F8F4EE] p-3">
                  <div className="text-[6px] uppercase tracking-[.12em] text-[#A29588]">Capability</div>
                  <div className="mt-1 font-mono text-[8px] font-semibold text-[#514A43]">work-requests</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-white p-2"><div className="text-[5px] text-[#A09589]">entity_id</div><div className="mt-1 font-mono text-[6px] text-[#665D54]">current entity</div></div>
                    <div className="rounded-md bg-white p-2"><div className="text-[5px] text-[#A09589]">period_id</div><div className="mt-1 font-mono text-[6px] text-[#665D54]">current period</div></div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-[#1D1A17] p-3 font-mono text-[6px] leading-4 text-[#E8D2B4]">
                  <div><span className="text-[#D6A66A]">GET</span> /api/developer/v1/operations/work-requests</div>
                  <div className="mt-1 text-white/45">Authorization: Bearer $AVANTIQO_TOKEN</div>
                  <div className="text-white/45">X-Avantiqo-Environment: production</div>
                  <div className="mt-2 text-[#9DC6A2]">✓ organization scope bound</div>
                  <div className="text-[#9DC6A2]">✓ capability authority verified</div>
                  <div className="text-[#9DC6A2]">✓ request evidence recorded</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[16px] border border-black/[.07] bg-white p-3">
                  <div className="text-[7px] font-semibold uppercase tracking-[.12em] text-[#9A6531]">Webhooks</div>
                  <div className="mt-3 space-y-2">
                    {[["invoice.posted","DELIVERED"],["staff.updated","DELIVERED"],["developer.test","RETRYING"]].map(([event,status])=><div key={event} className="rounded-lg bg-[#F8F4EE] p-2">
                      <div className="flex items-center justify-between"><span className="font-mono text-[6px] text-[#5D554E]">{event}</span><span className={"text-[5px] font-semibold "+(status==="RETRYING"?"text-[#A56B32]":"text-[#5C7D61]")}>{status}</span></div>
                    </div>)}
                  </div>
                </div>
                <div className="rounded-[16px] border border-black/[.07] bg-white p-3">
                  <div className="text-[7px] font-semibold uppercase tracking-[.12em] text-[#9A6531]">Usage & health</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[["Requests","1,284"],["p95","182ms"],["Failures","0.3%"],["Quota","28%"]].map(([a,b])=><div key={a} className="rounded-lg bg-[#F8F4EE] p-2"><div className="text-[5px] text-[#9A9086]">{a}</div><div className="mt-1 text-[9px] font-semibold text-[#554C44]">{b}</div></div>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[["Identity","Scoped credential"],["Context","Org · entity · period"],["Evidence","Request ID · audit"]].map(([a,b])=><div key={a} className="rounded-xl border border-black/[.06] bg-[#F5EFE7] p-3"><div className="text-[6px] font-semibold text-[#9A6531]">{a}</div><div className="mt-1 text-[6px] text-[#776D64]">{b}</div></div>)}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute left-8 top-8 rounded-full border border-white/70 bg-[#F8F1E8]/88 px-4 py-2 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8D6339] shadow-sm backdrop-blur-xl">ENVIRONMENTS · CREDENTIALS · API · WEBHOOKS · EVIDENCE</div>
    </div>
  );
}
