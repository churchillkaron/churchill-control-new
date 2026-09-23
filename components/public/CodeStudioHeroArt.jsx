export default function CodeStudioHeroArt() {
  const talk = [
    ["You","Redesign this product flow. Show me the architecture and UI direction visually before we build it."],
    ["Code","I’ve grounded this in the live repository, current routes and active product structure."],
  ];

  return (
    <div className="relative min-h-[760px] overflow-hidden rounded-[30px] border border-black/[.09] bg-[#EEE7DD] shadow-[0_32px_90px_rgba(69,50,31,.14)] sm:min-h-[590px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(214,166,106,.22),transparent_33%),linear-gradient(135deg,#F9F5EE,#E8DED1)]" />
      <div className="absolute inset-[18px] overflow-hidden rounded-[22px] border border-black/[.08] bg-[#F7F3EC] shadow-[0_16px_45px_rgba(56,40,24,.10)]">
        <div className="flex h-12 items-center border-b border-black/[.08] bg-[#F2EBE1] px-4">
          <div className="text-[10px] font-semibold text-[#2C2722]">&lt;/&gt; &nbsp; Avantiqo Code Studio</div>
          <div className="ml-4 text-[6px] font-semibold uppercase tracking-[.2em] text-[#9B8065]">same project session</div>
          <div className="ml-auto rounded-full border border-[#B7793B]/30 bg-[#EEDBC2] px-3 py-1 text-[6px] font-semibold text-[#7B542F]">LIVE REPOSITORY</div>
        </div>

        <div className="flex h-11 items-center gap-1 border-b border-black/[.07] bg-[#F8F5EF] px-3">
          {[
            ["Talk","active"],
            ["Code",""],
            ["Preview",""],
            ["Changes",""],
          ].map(([label,state])=><div key={label} className={"rounded-lg px-4 py-2 text-[7px] font-semibold "+(state?"bg-[#1D1A17] text-white":"text-[#776E65]")}>{label}</div>)}
          <div className="ml-auto hidden text-[6px] uppercase tracking-[.13em] text-[#9A9085] sm:block">one mission · one context · one diff</div>
        </div>

        <div className="grid h-[665px] grid-cols-1 sm:h-[509px] sm:grid-cols-[minmax(0,1fr)_245px]">
          <div className="min-w-0 p-4">
            <div className="space-y-2">
              {talk.map(([who,copy],i)=><div key={who+copy} className={"rounded-xl border p-3 "+(i===0?"border-black/[.07] bg-white":"border-[#B7793B]/18 bg-[#F6EADC]")}>
                <div className="text-[6px] font-semibold uppercase tracking-[.12em] text-[#9A6531]">{who}</div>
                <div className="mt-1 text-[8px] leading-4 text-[#5A5148]">{copy}</div>
              </div>)}
            </div>

            <div className="mt-3 overflow-hidden rounded-[16px] border border-black/[.08] bg-white shadow-[0_10px_30px_rgba(58,42,26,.05)]">
              <div className="flex items-center border-b border-black/[.07] bg-[#F1E9DE] px-3 py-2">
                <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#8B623B]">Visual conclusion · Product architecture</div>
                <div className="ml-auto flex gap-1.5">
                  <div className="rounded-md border border-black/[.08] bg-white px-2 py-1 text-[6px] text-[#756B61]">Open in Code</div>
                  <div className="rounded-md border border-[#B7793B]/25 bg-[#E8D3B8] px-2 py-1 text-[6px] font-semibold text-[#704A28]">Build this</div>
                </div>
              </div>

              <div className="grid gap-2 p-3 md:grid-cols-[.8fr_1.2fr]">
                <div className="rounded-xl border border-black/[.06] bg-[#F8F4EE] p-3">
                  <div className="text-[6px] uppercase tracking-[.12em] text-[#A09183]">Product flow</div>
                  <div className="mt-3 space-y-1.5">
                    {[
                      "Customer objective",
                      "Architecture",
                      "UI / interaction",
                      "Implementation",
                      "Verification",
                    ].map((x,i)=><div key={x} className={"rounded-md px-2 py-1.5 text-[6px] "+(i===0?"bg-[#E8D3B8] text-[#704A28]":"bg-white text-[#665D54]")}>{x}</div>)}
                  </div>
                </div>

                <div className="rounded-xl border border-black/[.06] bg-[#FBF8F2] p-3">
                  <div className="text-[6px] uppercase tracking-[.12em] text-[#A09183]">Live repository impact</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Frontend","Layout + interaction"],
                      ["API","Contracts + data flow"],
                      ["Runtime","Execution + state"],
                      ["Verification","Tests + browser proof"],
                    ].map(([a,b])=><div key={a} className="rounded-lg border border-black/[.06] bg-white p-2">
                      <div className="text-[6px] font-semibold text-[#8B623B]">{a}</div>
                      <div className="mt-1 text-[6px] leading-3 text-[#71675E]">{b}</div>
                    </div>)}
                  </div>
                  <div className="mt-3 rounded-lg bg-[#1D1A17] p-2.5 font-mono text-[6px] leading-4 text-[#E8D2B4]">
                    <div><span className="text-[#D6A66A]">mission</span> build approved visual</div>
                    <div className="text-white/45">context: conversation + schema + repo</div>
                    <div className="text-[#9DC6A2]">✓ inspect before edit</div>
                    <div className="text-[#9DC6A2]">✓ verify real result</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {["Show visually","Generate image","Research","Explain code"].map((x)=><div key={x} className="rounded-full border border-black/[.07] bg-white/60 px-3 py-1.5 text-[6px] text-[#766C62]">{x}</div>)}
            </div>
          </div>

          <aside className="hidden border-l border-black/[.07] bg-[#ECE4D8] p-3 sm:block">
            <div className="text-[7px] font-semibold uppercase tracking-[.17em] text-[#817468]">Same session</div>
            <div className="mt-3 space-y-2">
              {[
                ["Talk","Discuss · research · visualize"],
                ["Code","Live repo · IDE · terminal"],
                ["Preview","Running app · fast refresh"],
                ["Changes","Diff · proof · release state"],
              ].map(([a,b],i)=><div key={a} className={"rounded-xl border p-3 "+(i===0?"border-[#B7793B]/25 bg-[#F6E9D8]":"border-black/[.07] bg-white/44")}>
                <div className="text-[7px] font-semibold text-[#8B623B]">{a}</div>
                <div className="mt-1 text-[6px] leading-3 text-[#71675E]">{b}</div>
              </div>)}
            </div>

            <div className="mt-4 border-t border-black/[.07] pt-3">
              <div className="text-[6px] uppercase tracking-[.14em] text-[#8C8075]">Engineering handoff</div>
              <div className="mt-2 rounded-lg border border-black/[.07] bg-white/45 p-3">
                <div className="text-[6px] text-[#9A9085]">Latest instruction</div>
                <div className="mt-1 text-[8px] font-semibold text-[#5D554D]">“build this”</div>
                <div className="mt-2 text-[6px] leading-4 text-[#766C62]">Carries the approved visual, recent discussion and repository context into the mission.</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <div className="absolute left-8 top-8 rounded-full border border-white/70 bg-[#F8F1E8]/86 px-4 py-2 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8D6339] shadow-sm backdrop-blur-xl">TALK → CODE → PREVIEW → CHANGES</div>
    </div>
  );
}
