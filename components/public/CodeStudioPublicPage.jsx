import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import CodeStudioHeroArt from "@/components/public/CodeStudioHeroArt";

const chain = [
  ["01","Scope","Turn the business objective into an engineering mission with repository, organization and authority context."],
  ["02","Inspect","Read repository rules, architecture, packages, CI, build systems, dependencies and current head before editing."],
  ["03","Plan","Map impact, contracts, risks, affected surfaces and the verification work required for the change."],
  ["04","Build","Create and repair scoped source changes inside an isolated workspace instead of editing production blindly."],
  ["05","Verify","Run repository-aware tests, lint, type checks, builds and behavioral verification against the changed surface."],
  ["06","Review","Inspect the final diff, test provenance, failed-verifier closure and independent review evidence."],
  ["07","Certify","Bind repository head, environment and required engineering evidence into a release-readiness decision."],
  ["08","Deliver","Cross commit, PR or release boundaries only through separately governed authority, then retain verified engineering memory."],
];

const capabilities = [
  ["Live Code IDE","Connected-computer workspace · repository explorer · Monaco editor · governed terminal · shared revision · Git diff · Follow Code · live mission activity"],
  ["Conversational engineering","Natural live conversation · repository discovery without filenames · safe clarification only when needed · live steering at governed reasoning boundaries"],
  ["Repository intelligence","Instruction files · package manifests · CI workflows · build systems · language detection · semantic file index · symbols · imports · calls · dependency impact"],
  ["Engineering operating system","Architecture · implementation · browser · database · security · performance · SCM/multi-repo · specialist review departments activated by the mission"],
  ["Verification & repair","Tests · lint · typecheck · build · impacted-test selection · changed-line coverage guidance · browser proof · accessibility · visual regression · targeted repair"],
  ["Risk & review","Supply-chain scan · taint signals · business invariants · independent review · adversarial review · line-level findings · reviewer calibration"],
  ["Release engineering","Environment fingerprint · preview/staging · shadow comparison · canary plan · rollback gates · post-release observation · production authority kept separate"],
  ["Engineering memory","Mission history · verified engineering memory · failure patterns · reusable skills · architecture brain · current-head revalidation before reuse"],
];

const uses = [
  ["Build product capabilities","Create application features, workflows, APIs and internal tools from a business or engineering objective."],
  ["Repair production defects","Trace a defect through runtime and repository evidence, repair the smallest correct surface and prove the failed behavior is closed."],
  ["Work live with developers","Let a developer inspect, edit and steer while Code follows the same workspace, revision, diff and evidence state."],
  ["Audit release readiness","Check UI, runtime, database, security, performance, browser flows and operational proof before calling software ready."],
  ["Coordinate multiple repositories","Preserve independent repository heads, dependency ordering and verification when one mission crosses frontend, backend, mobile or infrastructure."],
  ["Deliver with control","Create reviewable source changes and release evidence while commit, merge and production deployment remain separately authorized."],
];

function CodeStageArt({index}) {
  const bars = [
    ["Objective","Repository","Authority"],
    ["Rules","Architecture","Dependencies"],
    ["Impact","Contracts","Verification"],
    ["Workspace","Patch","Repair"],
    ["Tests","Browser","Build"],
    ["Diff","Review","Blockers"],
    ["Head","Evidence","Readiness"],
    ["Commit","PR","Release"],
  ][index] || [];
  const accent = index === 4 ? "PASS" : index === 5 ? "REVIEW" : index === 6 ? "READY" : index === 7 ? "GOVERNED" : "CODE";
  return <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(145deg,#F7F2EA,#E8DED1)]">
    <div className="absolute inset-3 rounded-[16px] border border-black/[.08] bg-[#FBF8F2]/95 shadow-[0_12px_28px_rgba(68,47,25,.09)]">
      <div className="flex h-8 items-center border-b border-black/[.07] bg-[#F0E8DD] px-3">
        <span className="text-[6px] font-semibold uppercase tracking-[.17em] text-[#8B6A48]">AVANTIQO CODE</span>
        <span className="ml-auto rounded-full border border-[#B7793B]/25 bg-[#F3E3CE] px-2 py-1 text-[5px] font-semibold tracking-[.12em] text-[#7E5632]">{accent}</span>
      </div>
      <div className="grid h-[calc(100%-32px)] grid-cols-[.72fr_1.28fr]">
        <div className="border-r border-black/[.07] bg-[#EEE7DD] p-2">
          {bars.map((item,i)=><div key={item} className={"mb-1.5 rounded-md border border-black/[.06] px-2 py-1.5 text-[6px] "+(i===index%3?"bg-[#E8D3B8] text-[#744C29]":"bg-white/50 text-[#7A7066]")}>{item}</div>)}
        </div>
        <div className="p-2.5 font-mono text-[6px] leading-[1.65] text-[#5A5148]">
          <div><span className="text-[#A56B32]">const</span> mission = code.prepare()</div>
          <div className="mt-1">head: <span className="text-[#7B624B]">verified</span></div>
          <div>workspace: <span className="text-[#7B624B]">isolated</span></div>
          <div>evidence: <span className="text-[#648064]">required</span></div>
          <div className="mt-2 h-px bg-black/[.07]"/>
          <div className="mt-2 text-[#648064]">✓ repository truth</div>
          <div className="text-[#648064]">✓ exact scope</div>
          <div className={index===5 ? "text-[#A56B32]" : "text-[#648064]"}>{index===5 ? "• review in progress" : "✓ proof attached"}</div>
        </div>
      </div>
    </div>
  </div>
}

function Arrow(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}

export default function CodeStudioPublicPage(){
  return <main className="min-h-screen bg-[#F6F2EA] text-[#171512]">
    <PublicSiteHeader context="Code Studio" audience="developers" />

    <section className="border-b border-[#CFC5B8]/55 bg-[#F3EEE5] text-[#171512]">
      <div className="mx-auto grid max-w-[1540px] gap-8 px-5 py-14 sm:px-7 lg:min-h-[700px] lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-10 lg:py-16">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A6531]">AVANTIQO CODE</div>
          <h1 className="mt-5 max-w-[620px] text-[54px] font-medium leading-[.91] tracking-[-.055em] sm:text-[72px]">Talk about the product. See it. Build it. Verify it.</h1>
          <p className="mt-5 text-[15px] text-[#5F574F]">One Studio attached to the live repository.</p>
          <p className="mt-5 max-w-[650px] text-[12px] leading-6 text-[#716A62]">Start in conversation. Ask for architecture, product ideas, UI direction, research, code explanation or a visual conclusion. Then build it autonomously or open the same context in the live IDE, preview the real running page and inspect the verified changes — without starting over in another tool.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/login?portal=developer" className="inline-flex h-12 items-center gap-3 rounded-full bg-[#171512] px-5 text-[11px] font-semibold text-white">Open Code <Arrow/></a>
            <a href="#system" className="inline-flex h-12 items-center rounded-full border border-black/10 bg-white/55 px-5 text-[11px] font-semibold text-[#655B52]">See the engineering system</a>
            <a href="/developers" className="inline-flex h-12 items-center rounded-full border border-[#B7793B]/25 bg-[#F3E3CE] px-5 text-[11px] font-semibold text-[#76502E]">Build on Avantiqo instead? Developers</a>
          </div>
          <div className="mt-9 grid grid-cols-2 border-t border-black/[.08] sm:grid-cols-4">
            {[["TALK","Ideas + research + visuals"],["CODE","Live repo + IDE + terminal"],["PREVIEW","Real running product"],["CHANGES","Diff + proof + release state"]].map(([a,b],i)=><div key={a} className={`py-5 ${i?"border-l border-black/[.07] pl-4":"pr-4"}`}><div className="text-[17px] text-[#9A6531]">{a}</div><div className="mt-1 text-[7px] uppercase tracking-[.11em] text-[#8D847B]">{b}</div></div>)}
          </div>
        </div>
        <CodeStudioHeroArt/>
      </div>
    </section>

    <section className="border-b border-black/[.07] bg-[#EDE6DB] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-[1540px]">
        <div className="grid gap-7 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A6531]">ONE STUDIO · FOUR VIEWS</div>
            <h2 className="mt-3 max-w-2xl text-[48px] leading-[.95] tracking-[-.05em] text-[#2D2823]">The conversation does not disappear when the coding starts.</h2>
          </div>
          <p className="max-w-2xl text-[12px] leading-6 text-[#69635B] lg:justify-self-end">Talk, Code, Preview and Changes are different views of the same project session. The discussion, approved visual direction, repository state, browser target and engineering evidence stay connected as work moves forward.</p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["01","Talk","Discuss product direction, architecture, research, UX, code and implementation ideas. Ask Code to show conclusions visually or generate reference imagery before touching the repository.",["Research","Architecture","Wireframes","Visual conclusions"]],
            ["02","Code","Open the live repository, Monaco editor, terminal, tree, diff and Code conversation together. Let Code build autonomously or edit manually in the same shared workspace.",["Live repository","Monaco","Terminal","Human + Code"]],
            ["03","Preview","Open the running page or app from the same project session. Refresh immediately after either Code or a human changes the source, without recreating context.",["Real app","Fast refresh","Browser target","Same session"]],
            ["04","Changes","See the actual changed files, final diff, tests, browser proof, review findings, blockers and release-readiness evidence before the work is called complete.",["Changed files","Diff","Verification","Release state"]],
          ].map(([n,title,copy,tags])=><article key={title} className="rounded-[22px] border border-black/[.07] bg-[#F9F6F0] p-5 shadow-[0_12px_30px_rgba(55,39,22,.035)]">
            <div className="text-[8px] font-semibold text-[#B7793B]">{n}</div>
            <h3 className="mt-5 text-[18px] font-semibold text-[#302B26]">{title}</h3>
            <p className="mt-3 min-h-[88px] text-[10px] leading-5 text-[#736D65]">{copy}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{tags.map(tag=><span key={tag} className="rounded-full border border-black/[.06] bg-white px-2.5 py-1 text-[7px] text-[#746A61]">{tag}</span>)}</div>
          </article>)}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-[22px] border border-[#B7793B]/20 bg-[#F8EFE3] p-5">
            <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#9A6531]">NATURAL HANDOFF</div>
            <div className="mt-2 text-[12px] leading-6 text-[#625A52]">After a discussion or visual conclusion, a simple “build this” or “do it” carries the recent conversation, approved visual direction and repository context into the engineering mission. Code does not receive an empty one-line instruction.</div>
          </div>
          <div className="rounded-[22px] border border-black/[.07] bg-[#1D1A17] p-5 text-white">
            <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#D6A66A]">VISUAL INTELLIGENCE</div>
            <div className="mt-2 text-[12px] leading-6 text-white/58">Architecture maps · flows · decision boards · wireframes · UI/layout concepts · generated visual references · repository impact — inline in Talk, grounded in the active project.</div>
          </div>
        </div>
      </div>
    </section>

    <section className="border-b border-black/[.07] bg-[#F8F5EF] px-5 py-16 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1540px]">
        <div className="grid gap-6 lg:grid-cols-[.95fr_1.05fr] lg:items-end"><div><div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#B7793B]">THE ENGINEERING CHAIN</div><h2 className="mt-3 text-[48px] leading-[.95] tracking-[-.05em]">From repository truth to verified software.</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#69635B] lg:justify-self-end">Every stage stays attached to the same mission, repository head, evidence and authority state. The system can repair a weak department without throwing away work that already passed.</p></div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{chain.map(([n,t,d],index)=><article key={t} className="overflow-hidden rounded-[22px] border border-black/[.07] bg-white shadow-[0_16px_38px_rgba(50,36,20,.04)]"><div className="relative aspect-[16/10] overflow-hidden bg-[#EEE7DD]"><CodeStageArt index={index}/><span className="absolute left-3 top-3 z-10 rounded-full border border-white/70 bg-[#F8F1E8]/90 px-2 py-1 text-[7px] text-[#815B36] shadow-sm backdrop-blur-xl">{n}</span></div><div className="p-5"><h3 className="text-[15px] font-semibold">{t}</h3><p className="mt-2 text-[9px] leading-5 text-[#746E66]">{d}</p></div></article>)}</div>
      </div>
    </section>

    <section id="system" className="bg-[#F3EFE7] px-5 py-18 sm:px-7 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-[1540px]">
        <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#A56B32]">WHAT IS ACTUALLY INSIDE</div><h2 className="mt-3 max-w-2xl text-[48px] leading-[.95] tracking-[-.05em]">A software-engineering system, not a code generator.</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#69635B] lg:justify-self-end">Code separates conversation, repository intelligence, implementation, verification, review, memory and release authority so stronger reasoning never silently becomes stronger permission.</p></div>
        <div className="mt-10 overflow-hidden rounded-[28px] border border-black/[.08] bg-white/55">{capabilities.map(([a,b],i)=><div key={a} className={`grid gap-3 px-6 py-6 lg:grid-cols-[.32fr_.68fr] ${i?"border-t border-black/[.07]":""}`}><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#A56B32]">{a}</div><div className="text-[10px] leading-5 text-[#6F6961]">{b}</div></div>)}</div>
      </div>
    </section>

    <section className="border-y border-[#CFC5B8]/50 bg-[#EDE5DA] px-5 py-18 sm:px-7 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-[1540px] grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-start"><div><div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A6531]">BEFORE CODE IS TRUSTED</div><h2 className="mt-4 text-[46px] leading-[.96] tracking-[-.05em] text-[#2D2823]">Evidence before release.</h2><p className="mt-5 max-w-xl text-[11px] leading-6 text-[#6F675F]">A mission can carry repository-head evidence, semantic impact, tests, build results, browser proof, accessibility and visual checks, security and data review, business invariants, final diff review and release-readiness gates. Commit, merge and production deployment stay behind separate authority.</p></div><div className="grid gap-px overflow-hidden rounded-[24px] border border-black/[.08] bg-black/[.06] sm:grid-cols-2">{[["01","Repository truth","Pinned head, rules, architecture and dependency evidence before mutation."],["02","Real verification","Repository-aware tests, build, semantics and impacted-behavior proof."],["03","Browser proof","Live user-flow checks with navigation, console, requests and screenshot evidence."],["04","Independent review","Actual diff review, security/data checks and higher-risk specialist review."],["05","Repair closure","A failing verifier remains a blocker until repaired or explicitly unresolved."],["06","Release boundary","Certification first; commit, PR, merge and deployment require their own authority."]].map(([n,t,c])=><div key={t} className="bg-[#F8F4ED] p-6"><div className="text-[8px] text-[#A56B32]">{n}</div><div className="mt-6 text-[16px] text-[#2D2823]">{t}</div><div className="mt-2 text-[9px] leading-5 text-[#736A61]">{c}</div></div>)}</div></div>
    </section>

    <section className="bg-[#F7F4EE] px-5 py-18 sm:px-7 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1540px]"><div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#A56B32]">REAL ENGINEERING WORK</div><h2 className="mt-3 text-[46px] leading-[.96] tracking-[-.05em]">Built to change real software.</h2><div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{uses.map(([t,c],i)=><div key={t} className="rounded-[22px] border border-black/[.07] bg-white p-6"><div className="text-[8px] text-[#B7793B]">0{i+1}</div><h3 className="mt-7 text-[17px] font-semibold">{t}</h3><p className="mt-3 text-[10px] leading-5 text-[#736D65]">{c}</p></div>)}</div></div></section>

    <section className="bg-[#F7F4EE] px-5 pb-24 sm:px-7 lg:px-10"><div className="mx-auto max-w-[1320px] rounded-[32px] border border-[#CDB898]/45 bg-[linear-gradient(135deg,#FFF9EF,#F0DEC4)] px-8 py-16 text-center"><div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#A56B32]">AVANTIQO CODE</div><h2 className="mx-auto mt-4 max-w-4xl text-[44px] leading-[.98] tracking-[-.05em]">Work with Code. Watch the work. Verify the result.</h2><div className="mt-8 flex justify-center gap-3"><a href="/login?portal=developer" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171512] px-5 text-[11px] font-semibold text-white">Open Code <Arrow/></a><a href="/developers" className="inline-flex h-11 items-center rounded-full border border-black/10 bg-white/50 px-5 text-[11px] font-semibold text-[#5E554C]">Developer Platform</a></div></div></section>
  </main>
}
