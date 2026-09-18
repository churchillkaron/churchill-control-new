import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

const process = [
  ["01", "Brief", "Objective, audience and constraints"],
  ["02", "Research", "Context, references and opportunity"],
  ["03", "Direction", "Creative system and production plan"],
  ["04", "Creation", "Specialist production engines"],
  ["05", "Review", "Critique, quality and continuity"],
  ["06", "Repair", "Targeted correction and refinement"],
  ["07", "Delivery", "Delivery-ready masters and variants"],
];

function StudioUseCaseArt({ studio, index }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");

  if (video) {
    const modes = [
      ["COMPOSITE", ["PLATE", "DEPTH", "MATTE", "LIGHT"]],
      ["SIMULATION", ["SOURCE", "RIGID", "SMOKE", "DEBRIS"]],
      ["OPTICAL", ["LENS", "GRAIN", "HALATION", "MOTION"]],
      ["SOUND TO PICTURE", ["DX", "FOLEY", "FX", "MX"]],
      ["COLOR / DI", ["BALANCE", "MATCH", "LOOK", "QC"]],
      ["MASTER", ["PICTURE", "5.1", "7.1", "STEMS"]],
    ];
    const [label, items] = modes[index % modes.length];
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#0D0C0A] text-white">
        <div className="absolute inset-0 opacity-[.10]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px)",backgroundSize:"28px 28px"}}/>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_26%,rgba(214,166,106,.10),transparent_34%)]"/>
        <div className="absolute left-3 top-3 text-[6px] font-semibold tracking-[.15em] text-[#D6A66A]">{label}</div>
        <div className="absolute inset-x-3 top-[34px] grid grid-cols-2 gap-2">
          {items.map((item,i)=><div key={item} className="rounded-[9px] border border-white/[.07] bg-white/[.025] px-2.5 py-2">
            <div className="text-[5px] text-[#D6A66A]">0{i+1}</div>
            <div className="mt-1.5 text-[6px] tracking-[.10em] text-white/46">{item}</div>
          </div>)}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5">
          {[28,52,74,44,86,61,92].map((h,i)=><span key={i} className="h-[2px] flex-1 bg-white/[.07]"><span className="block h-full bg-[#D6A66A]/50" style={{width:`${h}%`}}/></span>)}
        </div>
      </div>
    );
  }

  if (music) {
    const modes = [
      ["RECORDING", ["TAKE 01", "TAKE 02", "COMP", "SOURCE"]],
      ["VOCAL PRODUCTION", ["TIMING", "TUNING", "DYNAMICS", "DEPTH"]],
      ["MIX", ["VOX", "DRUMS", "BASS", "MUSIC"]],
      ["AUTOMATION", ["LEVEL", "PAN", "SEND", "FX"]],
      ["PREMASTER", ["PHASE", "PEAK", "LOUDNESS", "MONO"]],
      ["DELIVERY", ["MASTER", "INSTR.", "ACAP.", "STEMS"]],
    ];
    const [label, items] = modes[index % modes.length];
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#100E0C] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(214,166,106,.05),transparent_45%)]"/>
        <div className="absolute left-3 top-3 text-[6px] font-semibold tracking-[.15em] text-[#D6A66A]">{label}</div>
        <div className="absolute inset-x-3 top-[33px] space-y-2">
          {items.map((item,i)=><div key={item} className="grid grid-cols-[38px_1fr_20px] items-center gap-2">
            <span className="text-[5px] tracking-[.08em] text-white/28">{item}</span>
            <span className="relative h-[8px] overflow-hidden rounded-sm bg-white/[.05]"><span className="absolute inset-y-0 left-0 bg-white/28" style={{width:`${[64,82,53,74][i]}%`}}/><span className="absolute inset-y-0 left-[62%] w-px bg-[#D6A66A]/55"/></span>
            <span className="text-right text-[5px] text-white/20">0{i+1}</span>
          </div>)}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between border-t border-white/[.07] pt-2 text-[5px] tracking-[.10em] text-white/24"><span>24-BIT / 48 KHZ</span><span>PHASE COHERENT</span></div>
      </div>
    );
  }

  const modes = [
    ["ART DIRECTION", ["REFERENCE", "COMPOSITION", "LIGHT", "TYPE"]],
    ["CAMPAIGN", ["HERO", "DETAIL", "SOCIAL", "OOH"]],
    ["PRODUCT", ["SOURCE", "RETOUCH", "COLOR", "LAYOUT"]],
    ["BRAND SYSTEM", ["GRID", "TYPE", "IMAGE", "LOCKUP"]],
    ["REPAIR", ["MASK", "DETAIL", "MATCH", "QC"]],
    ["DELIVERY", ["4:5", "1:1", "16:9", "PRINT"]],
  ];
  const [label, items] = modes[index % modes.length];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#EEE8DF] text-[#171614]">
      <div className="absolute inset-0 opacity-[.24]" style={{backgroundImage:"linear-gradient(rgba(82,67,52,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(82,67,52,.12) 1px,transparent 1px)",backgroundSize:"30px 30px"}}/>
      <div className="absolute left-3 top-3 text-[6px] font-semibold tracking-[.15em] text-[#9A744B]">{label}</div>
      <div className="absolute inset-x-3 top-[34px] grid grid-cols-2 gap-2">{items.map((item,i)=><div key={item} className="relative h-[34px] overflow-hidden rounded-[8px] border border-black/[.07] bg-white/60 p-2"><div className="text-[5px] text-[#9A744B]">0{i+1}</div><div className="mt-1 text-[6px] tracking-[.08em] text-black/45">{item}</div></div>)}</div>
      <div className="absolute bottom-3 left-3 right-3 flex gap-1">{[1,2,3,4,5].map((n)=><span key={n} className="h-[2px] flex-1 bg-black/[.08]"><span className="block h-full bg-[#A37849]/45" style={{width:`${32+n*11}%`}}/></span>)}</div>
    </div>
  );
}

function Arrow({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
    >
      <path
        d="M4 10h11M11 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudioArtwork({ studio }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");
  const kind = video ? "video-studio" : music ? "music-studio" : "image-studio";
  const mode = video
    ? "VFX / SIMULATION / COMPOSITE / FINISH"
    : music
      ? "RECORD / PRODUCE / MIX / MASTER"
      : "ART DIRECTION / LAYOUT / DELIVERY";
  const caption = video
    ? "Picture craft, not prompt-to-video"
    : music
      ? "Record production, not AI song generation"
      : "Commercial visual production, not image prompting";
  return (
    <div className="relative min-h-[590px] overflow-hidden rounded-[32px] border border-black/[0.08] bg-[#151310] shadow-[0_38px_110px_rgba(68,47,25,.18)]">
      <PublicArtStage kind={kind} />
      <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-[#11100E]/78 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#E1B87F] shadow-sm backdrop-blur-xl">
        AVANTIQO {studio}
      </div>
      <div className="absolute right-5 top-5 hidden rounded-[16px] border border-white/12 bg-[#11100E]/72 px-3 py-2 text-right backdrop-blur-xl sm:block">
        <div className="text-[7px] uppercase tracking-[0.2em] text-[#DDB27A]">{mode}</div>
        <div className="mt-1 text-[8px] text-white/42">Professional production environment</div>
      </div>
      <div className="absolute bottom-5 left-5 right-5 rounded-[20px] border border-white/12 bg-[#11100E]/76 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,.28)] backdrop-blur-xl sm:p-5">
        <div className="flex items-end justify-between gap-5">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#E0B77F]">{caption}</div>
            <div className="mt-2 max-w-lg text-[11px] leading-5 text-white/52">
              Real production state, specialist passes, review evidence and deterministic finishing stay connected from source through master.
            </div>
          </div>
          <div className="hidden gap-1.5 sm:flex">
            {(video ? ["PASSES","COMPOSITE","MASTER"] : music ? ["TAKES","MIX","MASTER"] : ["BRIEF","LAYOUT","MASTER"]).map((x) => (
              <span key={x} className="rounded-full border border-white/12 bg-white/[0.025] px-2 py-1 text-[7px] tracking-[0.13em] text-white/46">{x}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisciplineGlyph({ studio, index }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");

  if (music)
    return (
      <div className="relative h-14 overflow-hidden rounded-[14px] border border-black/[0.06] bg-[#F8F4EE]">
        <div className="absolute left-3 top-2 text-[6px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
          MIX {String(index + 1).padStart(2, "0")}
        </div>
        <div className="absolute inset-x-3 top-[22px] flex h-5 items-center justify-center gap-[2px]">
          {[30, 58, 82, 46, 92, 64, 38, 74, 52, 86, 43, 68].map((h, i) => (
            <span
              key={i}
              className="w-[2px] rounded-full bg-[#A37849]/65"
              style={{ height: `${Math.max(18, h - (index % 3) * 5)}%` }}
            />
          ))}
        </div>
        <div className="absolute inset-x-3 bottom-2 flex gap-1">
          {[0, 1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-[3px] flex-1 rounded-full ${n === index % 4 ? "bg-[#A37849]/70" : "bg-black/[0.07]"}`}
            />
          ))}
        </div>
      </div>
    );

  if (video)
    return (
      <div className="relative h-14 overflow-hidden rounded-[14px] border border-black/[0.06] bg-[#F8F4EE]">
        <div className="absolute left-3 top-2 text-[6px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
          SHOT {String(index + 1).padStart(2, "0")}
        </div>
        <div className="absolute inset-x-3 top-[18px] h-6 overflow-hidden rounded-[7px] border border-black/[0.07] bg-[#EEE6DA]">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#A37849]/28" />
          <div className="absolute left-[62%] top-[30%] h-2.5 w-2.5 rounded-full bg-[#A37849]/38" />
          <div className="absolute bottom-0 left-[22%] h-[55%] w-px bg-black/[0.09]" />
          <div className="absolute bottom-0 right-[22%] h-[55%] w-px bg-black/[0.09]" />
        </div>
        <div className="absolute inset-x-3 bottom-2 flex gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={`h-[2px] flex-1 ${n === index % 5 ? "bg-[#A37849]/75" : "bg-black/[0.07]"}`}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="relative h-14 overflow-hidden rounded-[14px] border border-black/[0.06] bg-[#F8F4EE]">
      <div className="absolute left-3 top-2 text-[6px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
        LAYOUT {String(index + 1).padStart(2, "0")}
      </div>
      <div className="absolute bottom-2 left-3 top-[20px] w-[38%] rounded-[7px] border border-[#A37849]/22 bg-white/70">
        <div className="absolute inset-x-2 bottom-2 h-[2px] bg-[#A37849]/50" />
        <div className="absolute left-2 top-2 h-3 w-3 rounded-full bg-[#D6A66A]/30" />
      </div>
      <div
        className={`absolute right-3 top-[19px] h-[27px] w-[43%] rounded-[7px] border border-black/[0.07] bg-[#EFE7DB] ${index % 2 ? "rotate-[-3deg]" : ""}`}
      >
        <div className="absolute left-2 right-2 top-2 h-[3px] bg-black/[0.10]" />
        <div className="absolute left-2 right-4 top-4 h-[2px] bg-[#A37849]/40" />
        <div className="absolute left-2 right-2 bottom-2 h-[2px] bg-black/[0.07]" />
      </div>
      <div className="absolute left-2 top-2 h-2 w-2 border-l border-t border-[#A37849]/45" />
      <div className="absolute bottom-2 right-2 h-2 w-2 border-b border-r border-[#A37849]/45" />
    </div>
  );
}

function ProductPath() {
  return (
    <div className="relative mt-10 overflow-hidden rounded-[28px] border border-black/[0.07] bg-white p-5 shadow-[0_20px_60px_rgba(53,42,28,.045)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_50%,rgba(214,166,106,.08),transparent_22%),radial-gradient(circle_at_90%_50%,rgba(154,116,75,.06),transparent_22%)]" />
      <div className="relative grid grid-cols-2 gap-3 xl:grid-cols-7 xl:gap-0">
        {process.map(([n, t, d], i) => (
          <div key={t} className="relative xl:px-2">
            <div
              className={`min-h-[132px] rounded-[18px] border p-4 ${i === 3 ? "border-[#D6A66A]/35 bg-[#FBF5EC]" : "border-black/[0.06] bg-[#FCFBF9]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold text-[#A37849]">{n}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/60" />
              </div>
              <h3 className="mt-7 text-[13px] font-semibold text-[#2D2924]">
                {t}
              </h3>
              <p className="mt-2 text-[8px] leading-4 text-[#837C73]">{d}</p>
            </div>
            {i < process.length - 1 ? (
              <div className="absolute -right-1 top-1/2 z-10 hidden h-px w-2 bg-[#A37849]/35 xl:block" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="relative mt-5 h-px bg-black/[0.06]">
        <div className="h-px w-[78%] bg-gradient-to-r from-[#D6A66A]/20 via-[#A37849]/55 to-transparent" />
      </div>
    </div>
  );
}

function CapabilityNetwork({ studio }) {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#12110f] shadow-[0_24px_70px_rgba(40,30,20,.12)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(214,166,106,.16),transparent_22%)]" />
      <div className="absolute left-1/2 top-1/2 flex h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/35 bg-[#17130f] shadow-[0_0_55px_rgba(214,166,106,.13)]">
        <div className="text-center">
          <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#E0B77E]">
            {studio}
          </div>
          <div className="mt-1 text-[7px] uppercase tracking-[0.15em] text-white/28">
            Capability
          </div>
        </div>
      </div>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full text-[#D6A66A]"
        viewBox="0 0 600 360"
        preserveAspectRatio="none"
      >
        <path
          d="M300 180 C225 140 190 90 105 78"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
        <path
          d="M300 180 C375 140 410 90 495 78"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
        <path
          d="M300 180 C225 220 190 270 105 282"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
        <path
          d="M300 180 C375 220 410 270 495 282"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
      </svg>
      {[
        ["Studio", "Mission", "left-[6%] top-[12%]"],
        ["API", "Workflow", "right-[6%] top-[12%]"],
        ["Agent", "Tool", "left-[6%] bottom-[12%]"],
        ["Embedded", "Experience", "right-[6%] bottom-[12%]"],
      ].map(([a, b, pos], i) => (
        <div
          key={a}
          className={`absolute ${pos} w-[120px] rounded-[15px] border border-white/[0.08] bg-white/[0.025] p-3`}
        >
          <div className="text-[7px] font-bold text-[#D6A66A]">0{i + 1}</div>
          <div className="mt-3 text-[10px] font-semibold text-white/72">
            {a}
          </div>
          <div className="text-[8px] text-white/28">{b}</div>
        </div>
      ))}
    </div>
  );
}

function SharedAudioArchitecture({ studio }) {
  const video = studio.startsWith("Video");
  const rooms = [
    ["01", "Music Production", "Artist and record production: performance, recording, comping, arrangement, vocal and instrument production, editing, mix and master."],
    ["02", "Sound Design", "Source recording and library search, Foley, ambience, machines, vehicles, objects, designed effects, impact sweeteners, sub and transition design."],
    ["03", "Audio Post", "Spotting, dialogue, Foley, SFX, music editing, picture sync, object movement, spatial placement and premix against the locked picture."],
    ["04", "Mastering & Delivery", "Stereo, surround and multichannel masters, stems, loudness profiles, translation QC, downmix checks and final picture mux packages."],
  ];
  const engine = [
    "SAMPLE-ACCURATE TIMELINE","MULTICHANNEL BUSES","OBJECT POSITIONING","AUTOMATION","ROUTING","STEM ARCHITECTURE",
    "PHASE / CORRELATION","LOUDNESS","TRUE PEAK","DYNAMIC RANGE","DOWNMIX QC","ROOM / REVERB MODELLING",
    "LFE MANAGEMENT","PICTURE SYNC","IMMUTABLE SOURCES"
  ];
  return (
    <section className="border-b border-black/[0.06] bg-[#F4EFE7] text-[#1A1815]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">{video ? "CINEMA / AUDIO ARCHITECTURE" : "MUSIC / AUDIO ARCHITECTURE"}</p>
            <h2 className="mt-4 max-w-xl text-[40px] font-medium leading-[1.00] tracking-[-0.052em] sm:text-[52px]">
              {video ? "Sound is a production department, not a background track." : "Record production, not AI song generation."}
            </h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-[14px] leading-7 text-[#6E675F]">
              {video
                ? "Every important object can carry its own sonic identity and evolve with camera position, movement, environment and story. A vehicle is not one engine file; it can be intake, exhaust, transmission, tires, wind, mechanical resonance, subharmonic design, transient layers and environmental reflections."
                : "The target is a complete record-production chain: performance, source quality, timing, phase, comping, vocal and instrument production, arrangement, editing, depth, imaging, dynamics, ambience, automation, premaster listening, mastering and translation QC."}
            </p>
          </div>
        </div>

        <div className="relative mt-12 overflow-hidden rounded-[28px] border border-white/[.07] bg-[#11100E] text-white shadow-[0_30px_90px_rgba(0,0,0,.18)]">
          <div className="absolute inset-0 opacity-[.07]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px)",backgroundSize:"44px 44px"}}/>
          <div className="relative border-b border-white/[.08] px-6 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><p className="text-[8px] font-semibold uppercase tracking-[.19em] text-[#D6A66A]">ONE CANONICAL STUDIO PROJECT</p><div className="mt-2 text-[12px] text-white/46">Media pool · timecode · picture lock · audio sources · automation · version lineage · QC evidence</div></div>
              <div className="font-mono text-[7px] tracking-[.12em] text-white/22">PROJECT / SHARED TIMELINE</div>
            </div>
          </div>
          <div className="relative grid lg:grid-cols-4">
            {rooms.map(([n,t,d],i)=><div key={t} className={"min-h-[250px] p-6 " + (i<3 ? "border-b border-white/[.07] lg:border-b-0 lg:border-r" : "")}>
              <div className="flex items-center justify-between"><span className="text-[7px] font-bold text-[#D6A66A]">{n}</span><span className="h-1.5 w-1.5 rounded-full bg-white/16"/></div>
              <h3 className="mt-8 text-[17px] font-semibold tracking-[-0.02em] text-white/82">{t}</h3>
              <p className="mt-3 text-[9px] leading-5 text-white/34">{d}</p>
              <div className="mt-7 border-t border-white/[.07] pt-3 text-[6px] tracking-[.12em] text-white/22">SHARED ENGINE / SAME TIMECODE</div>
            </div>)}
          </div>
          <div className="relative border-t border-white/[.08] p-6 sm:p-7">
            <div className="grid gap-8 lg:grid-cols-[.60fr_1.40fr]">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.19em] text-[#D6A66A]">PROFESSIONAL AUDIO ENGINE</p>
                <h3 className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-0.045em] text-white/92">One deterministic engine underneath all four rooms.</h3>
                <p className="mt-4 text-[10px] leading-5 text-white/34">Music, sound design, audio post and mastering share the same routing, spatial state, source lineage, analysis and render truth.</p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-0 sm:grid-cols-3">
                {engine.map((x,i)=><div key={x} className="flex min-h-[48px] items-center border-b border-white/[.07] py-3">
                  <span className="mr-3 font-mono text-[6px] text-[#D6A66A]">{String(i+1).padStart(2,"0")}</span>
                  <span className="text-[7px] font-semibold tracking-[0.09em] text-white/43">{x}</span>
                </div>)}
              </div>
            </div>
          </div>
        </div>

        {video ? <div className="mt-6 overflow-hidden rounded-[22px] border border-black/[0.08] bg-white/55">
          <div className="grid lg:grid-cols-[.42fr_1.58fr]">
            <div className="border-b border-black/[.07] p-5 lg:border-b-0 lg:border-r">
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">SONIC OBJECT MODEL</div>
              <h3 className="mt-4 text-[24px] font-medium leading-[1.05] tracking-[-.04em] text-[#27231F]">One picture object can carry an entire sound system.</h3>
              <p className="mt-4 text-[9px] leading-5 text-[#756E65]">Layers change with velocity, screen position, distance, environment, camera relation and story intensity.</p>
            </div>
            <div className="p-5">
              <div className="grid gap-px overflow-hidden border border-black/[.07] bg-black/[.07] sm:grid-cols-5">
                {[["SOURCE","Intake · exhaust"],["MECHANICS","Transmission · body"],["ENVIRONMENT","Tires · wind · reflections"],["DESIGN","Growl · sub · transient"],["MOTION","Position · distance · trajectory"]].map(([a,b],i)=><div key={a} className="bg-[#F7F3EC] p-4">
                  <div className="text-[6px] font-semibold text-[#A37849]">0{i+1}</div>
                  <div className="mt-4 text-[8px] font-semibold tracking-[.10em] text-[#332E29]">{a}</div>
                  <div className="mt-2 text-[7px] leading-4 text-[#7B736B]">{b}</div>
                </div>)}
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-black/[.07] pt-4 text-[6px] tracking-[.11em] text-[#8A8178]"><span className="h-1.5 w-1.5 rounded-full bg-[#A37849]"/><span>OBJECT STATE DRIVES ROUTING · AUTOMATION · ROOM RESPONSE · LFE ELIGIBILITY</span></div>
            </div>
          </div>
        </div> : null}
      </div>
    </section>
  );
}

function VideoProductionArchitecture() {
  const layers = [
    ["01", "Reconstruction execution backend", "Break approved shots into geometry, depth, masks, motion, lighting and reconstruction tasks that can be executed and repaired independently."],
    ["02", "Executable pass renderer / dispatcher", "Route exact production passes to the right render or generation engine, preserve dependencies and re-run only the failed pass instead of restarting the shot."],
    ["03", "Physical simulation engine", "Handle particles, smoke, water, cloth, debris, atmosphere, collisions, light interaction and other simulation-heavy details as controlled production layers."],
    ["04", "Deep compositing", "Nuke-style node thinking for mattes, depth, relighting, keying, tracking, cleanup, roto, integration, atmosphere and shot-level VFX assembly."],
    ["05", "Cinematic sound-event engine", "Layer dialogue, Foley, ambience, impacts, movement, environments and spatial events into a designed multichannel soundtrack instead of adding one flat audio track."],
    ["06", "Optical & lens finishing", "Finish the image with lens response, motion character, halation, grain, depth cues, bloom, distortion, chromatic behavior and final cinematic consistency."],
  ];
  return (
    <section className="border-b border-white/[0.07] bg-[#0D0C0A] text-white">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.76fr_1.24fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">VIDEO STUDIO / PRODUCTION ARCHITECTURE</p>
            <h2 className="mt-4 max-w-xl text-[40px] font-medium leading-[1.00] tracking-[-0.052em] text-[#F7F4EF] sm:text-[52px]">
              A film-production house with intelligence built into the pipeline.
            </h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-[14px] leading-7 text-white/55">
              The direction is a real post-production and VFX pipeline around intelligent production: shots become executable layers, passes, simulations, composites, sound events and finishing decisions. Generation is only one production department inside the system.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["SHOT RECONSTRUCTION","PASS RENDERING","PHYSICAL SIMULATION","VFX COMPOSITING","SURROUND SOUND","OPTICAL FINISH"].map((x)=><span key={x} className="rounded-full border border-[#D6A66A]/24 bg-[#D6A66A]/[.05] px-3 py-1.5 text-[7px] font-semibold tracking-[.14em] text-[#E5BC84]">{x}</span>)}
            </div>
          </div>
        </div>

        <div className="mt-12 overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#14120F] shadow-[0_34px_100px_rgba(0,0,0,.34)]">
          <div className="grid lg:grid-cols-[.72fr_1.28fr]">
            <div className="relative min-h-[460px] overflow-hidden border-b border-white/[0.08] p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_45%,rgba(214,166,106,.17),transparent_24%),linear-gradient(135deg,#16130F,#0A0908)]"/>
              <div className="absolute inset-0 opacity-[.10]" style={{backgroundImage:"linear-gradient(rgba(214,166,106,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(214,166,106,.15) 1px,transparent 1px)",backgroundSize:"54px 54px"}}/>
              <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 620 500" preserveAspectRatio="none">
                <path d="M82 250 H235 M385 250 H538 M310 85 V178 M310 322 V415" stroke="rgba(214,166,106,.34)" strokeWidth="1.2"/>
                <path d="M128 128 C210 128 214 214 258 236 M492 128 C410 128 406 214 362 236 M128 372 C210 372 214 286 258 264 M492 372 C410 372 406 286 362 264" fill="none" stroke="rgba(214,166,106,.22)" strokeWidth="1.1"/>
                <circle cx="310" cy="250" r="66" fill="rgba(24,19,14,.96)" stroke="rgba(214,166,106,.55)" strokeWidth="1.4"/>
              </svg>
              <div className="absolute left-1/2 top-1/2 w-[150px] -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-[9px] font-semibold tracking-[.16em] text-[#E9C28C]">SHOT STATE</div>
                <div className="mt-2 text-[7px] leading-4 text-white/34">Geometry · depth · masks · motion · light · sound</div>
              </div>
              {[["RECONSTRUCT","left-[7%] top-[14%]"],["SIMULATE","right-[7%] top-[14%]"],["COMPOSITE","left-[7%] bottom-[14%]"],["FINISH","right-[7%] bottom-[14%]"]].map(([x,pos],i)=><div key={x} className={"absolute " + pos + " w-[118px] rounded-[15px] border border-white/[.08] bg-black/30 p-3 backdrop-blur-sm"}><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-2 text-[8px] font-semibold tracking-[.11em] text-white/62">{x}</div></div>)}
              <div className="absolute bottom-6 left-6 right-6 border-t border-white/[.08] pt-4 text-[7px] leading-4 text-white/31">Approved layers stay locked. A failed pass can be repaired without destroying the rest of the shot.</div>
            </div>
            <div className="grid sm:grid-cols-2">
              {layers.map(([n,t,d],i)=><div key={t} className={"min-h-[230px] p-5 sm:p-6 " + (i%2===0 ? "sm:border-r sm:border-white/[.08] " : "") + (i<4 ? "border-b border-white/[.08]" : "")}>
                <div className="flex items-center justify-between"><span className="text-[8px] font-bold text-[#D6A66A]">{n}</span><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/70"/></div>
                <h3 className="mt-8 text-[15px] font-semibold leading-5 text-white/82">{t}</h3>
                <p className="mt-3 text-[9px] leading-5 text-white/35">{d}</p>
              </div>)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[20px] border border-[#D6A66A]/18 bg-[#D6A66A]/[.035] p-5 text-[9px] leading-5 text-white/38">
          <span className="font-semibold text-[#DDB47C]">Positioning:</span> this is being built toward cinema-grade production, VFX, compositing and multichannel sound workflows. Avantiqo should only use Dolby-certified language when the final delivery chain is actually licensed and certified; the Studio can still support surround and delivery-ready multichannel mastering.
        </div>
      </div>
    </section>
  );
}

function StudioWorkspace({ studio }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");
  const labels = video
    ? ["Story", "Shot Build", "Passes", "Composite", "Sound", "Master"]
    : music
      ? ["Compose", "Arrange", "Vocals", "SFX", "Mix", "Master"]
      : ["Research", "Direction", "Create", "Review", "Repair", "Deliver"];
  const artKind = video ? "video-studio" : music ? "music-studio" : "image-studio";
  const status = video
    ? "SHOT 024 / REVIEW"
    : music
      ? "MASTER BUS / REVIEW"
      : "CAMPAIGN 01 / REVIEW";
  return (
    <section className="border-b border-black/[0.06] bg-[#F1ECE4] text-[#1C1A17]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
              Inside {studio}
            </p>
            <h2 className="mt-3 max-w-xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[48px]">
              A real production workspace, connected end to end.
            </h2>
            <p className="mt-5 max-w-lg text-[13px] leading-7 text-[#706A62]">
              Direction, shot state, reconstruction passes, simulation, compositing,
              sound events, review and approved output stay connected. Video Studio
              behaves like a production pipeline with repairable departments, not a
              one-click generator.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {labels.map((x, i) => (
              <span
                key={x}
                className={`rounded-full border px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] ${i === 3 ? "border-[#B78A52]/35 bg-white text-[#8A633C] shadow-sm" : "border-black/[0.08] bg-white/55 text-[#766F66]"}`}
              >
                {String(i + 1).padStart(2, "0")} {x}
              </span>
            ))}
          </div>
        </div>
        <div className="relative mt-10 min-h-[560px] overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#CFC4B4] shadow-[0_34px_100px_rgba(71,50,28,.16)]">
          <div className="absolute inset-0 scale-[1.02]"><PublicArtStage kind={artKind} /></div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.05)_58%,rgba(8,7,6,.34))]" />
          <div className="absolute left-5 top-5 rounded-full border border-white/22 bg-black/28 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#F0C98F] backdrop-blur-xl">
            {status}
          </div>
          <div className="absolute right-5 top-5 hidden rounded-[16px] border border-white/20 bg-white/12 px-3 py-2 text-right text-white backdrop-blur-xl sm:block">
            <div className="text-[7px] uppercase tracking-[0.17em] text-[#F0C98F]">
              Live production context
            </div>
            <div className="mt-1 text-[8px] text-white/64">
              Brief · direction · review
            </div>
          </div>
          <div className="absolute bottom-5 left-5 right-5 grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-[22px] border border-white/20 bg-black/34 p-4 text-white backdrop-blur-xl sm:p-5">
              <div className="text-[7px] uppercase tracking-[0.18em] text-[#E9C28C]">
                Production path
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {labels.map((x, i) => (
                  <div
                    key={x}
                    className={`rounded-xl border p-2.5 ${i === 3 ? "border-[#E2B779]/55 bg-[#D6A66A]/14" : "border-white/12 bg-white/[0.035]"}`}
                  >
                    <div className="text-[7px] text-white/36">0{i + 1}</div>
                    <div className="mt-2 text-[8px] font-semibold text-white/74">
                      {x}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/20 bg-white/82 p-4 text-[#24201B] shadow-sm backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[7px] uppercase tracking-[0.18em] text-[#8A633C]">
                  Quality review
                </span>
                <span className="rounded-full border border-[#B78A52]/25 bg-[#F8F2E9] px-2 py-1 text-[7px] text-[#8A633C]">
                  TARGETED REPAIR
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ["Direction", 96],
                  ["Continuity", 93],
                  ["Craft", 95],
                  ["Delivery", 98],
                ].map(([x, v]) => (
                  <div key={x}>
                    <div className="flex justify-between text-[8px]">
                      <span className="text-[#716A61]">{x}</span>
                      <span className="font-semibold text-[#51493F]">{v}</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-black/[0.07]">
                      <div
                        className="h-full rounded-full bg-[#B4844E]"
                        style={{ width: `${v}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[8px] leading-4 text-[#7A736A]">
                Approved work remains locked. Only the failed detail returns to
                production.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CreativeStudioProductPage({
  studio,
  title,
  subtitle,
  description,
  capabilities,
  useCases,
  cta,
}) {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader
        context={studio}
        audience="creative"
        links={[
          {
            label: "Creative Studios",
            href: "/creative-studios",
            visibility: "hidden md:inline-flex",
          },
        ]}
      />

      <section className="border-b border-black/[0.06] bg-[#F7F6F3]">
        <div className="mx-auto grid max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-24">
          <div className="max-w-[690px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">
              Avantiqo {studio}
            </p>
            <h1 className="mt-5 text-[48px] font-medium leading-[.98] tracking-[-0.055em] text-[#181817] sm:text-[62px] lg:text-[72px]">
              {title}
            </h1>
            <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8D643C]">
              {subtitle}
            </p>
            <p className="mt-6 max-w-xl text-[16px] leading-8 text-[#625F59]">
              {description}
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href="#capabilities"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white"
              >
                Explore {studio} <Arrow className="h-3.5 w-3.5" />
              </a>
              <a
                href="#process"
                className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]"
              >
                See production flow
              </a>
            </div>
          </div>
          <StudioArtwork studio={studio} />
        </div>
      </section>

      <section
        id="capabilities"
        className="border-b border-black/[0.06] bg-[#FBFAF8]"
      >
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            A complete production system
          </p>
          <h2 className="mt-3 max-w-4xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">
            {studio.startsWith("Video") ? "Not a generator. A complete film-production system." : studio.startsWith("Music") ? "Not an AI song generator. A complete record-production system." : "Not a generator. A professional creative workflow."}
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {capabilities.map(([name, text], i) => (
              <article
                key={name}
                className="group min-h-[205px] rounded-[22px] border border-black/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(61,45,27,.06)]"
              >
                <DisciplineGlyph studio={studio} index={i} />
                <div className="mt-4 text-[8px] font-bold text-[#A37849]">
                  0{i + 1}
                </div>
                <h3 className="mt-3 text-[14px] font-semibold text-[#302D29]">
                  {name}
                </h3>
                <p className="mt-2 text-[9px] leading-5 text-[#7A756E]">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {studio.startsWith("Video") ? <VideoProductionArchitecture /> : null}

      {(studio.startsWith("Video") || studio.startsWith("Music")) ? <SharedAudioArchitecture studio={studio} /> : null}

      <StudioWorkspace studio={studio} />

      <section
        id="process"
        className="border-b border-black/[0.06] bg-[#F7F6F3]"
      >
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            From idea to impact
          </p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">
            One connected production path.
          </h2>
          <p className="mt-5 max-w-2xl text-[13px] leading-6 text-[#77716A]">
            The mission does not restart between stages. Direction, decisions,
            references and quality checks stay attached to the work all the way to
            delivery.
          </p>
          <ProductPath />
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-[#171716] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
            Real business use
          </p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[46px]">
            Creative output built to do a job.
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map(([name, text], index) => (
              <div
                key={name}
                className="group rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/25 hover:bg-white/[0.04]"
              >
                <div className="relative h-36 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#15120e]">
                  <StudioUseCaseArt studio={studio} index={index} />
                  <div className="absolute left-3 top-3 rounded-full border border-white/[.12] bg-[#11100E]/70 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.15em] text-[#E9C28C] backdrop-blur-xl">
                    0{index + 1}
                  </div>
                </div>
                <h3 className="mt-5 text-[14px] font-semibold text-white/82">
                  {name}
                </h3>
                <p className="mt-2 text-[10px] leading-5 text-white/38">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Creative production workspace</p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">Everything the creative team needs stays in one production environment.</h2>
          <p className="mt-5 max-w-2xl text-[13px] leading-7 text-[#706A62]">Briefs, references, direction, versions, reviews, repairs and final delivery remain attached to the project instead of being scattered across unrelated tools.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Brief & direction','Define the business goal, audience and creative direction.'],['Production','Create the visual, film or music work inside the same project.'],['Review & repair','Critique weak output, repair it and preserve the accepted direction.'],['Delivery','Approve, export and deliver production-ready assets.']].map(([t,d],i)=>(
              <div key={t} className="rounded-[22px] border border-black/[0.07] bg-white p-5"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-6 text-[15px] font-semibold text-[#302D29]">{t}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F1ECE4]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
                Ways to work with Creative Studios
              </p>
              <h2 className="mt-3 max-w-xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">
                Choose the production support that matches the job.
              </h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">
              Choose a complete production mission, recurring creative capacity or a focused production package depending on what the brand needs.
            </p>
          </div>
          <div className="mt-10 grid gap-3 lg:grid-cols-3">
            {[
              [
                "Production mission",
                "A defined creative outcome with research, direction, production, review and final delivery.",
                "START A PROJECT",
              ],
              [
                "Creative retainer",
                "Recurring production capacity for brands and teams that need a continuous flow of approved work.",
                "ONGOING CAPACITY",
              ],
              [
                "Focused production package",
                "A defined set of deliverables for launches, campaigns, recurring content or specialist production work.",
                "DEFINED DELIVERY",
              ],
            ].map(([title, text, label], i) => (
              <div
                key={title}
                className="rounded-[24px] border border-black/[0.07] bg-white p-6 shadow-[0_14px_42px_rgba(46,34,23,.04)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-[#A37849]">
                    0{i + 1}
                  </span>
                  <span className="text-[6px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">
                    {label}
                  </span>
                </div>
                <h3 className="mt-8 text-[19px] font-semibold tracking-[-0.03em] text-[#2A2723]">
                  {title}
                </h3>
                <p className="mt-3 text-[10px] leading-5 text-[#756F67]">
                  {text}
                </p>
                <div className="mt-6 h-px bg-black/[0.06]">
                  <div
                    className="h-px bg-[#D6A66A]/65"
                    style={{ width: `${48 + i * 18}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="relative overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#12110f] px-6 py-16 text-center text-white shadow-[0_28px_90px_rgba(46,34,23,.11)] sm:px-10 lg:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(214,166,106,.27),transparent_38%)]" />
            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
                A more creative tomorrow
              </p>
              <h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#F7F4EF] sm:text-[50px]">
                {cta}
              </h2>
              <div className="mx-auto mt-5 h-px max-w-sm bg-gradient-to-r from-transparent via-[#D6A66A]/38 to-transparent" />
              <div className="mt-8 flex flex-wrap justify-center gap-2.5">
                <a
                  href="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F7F4EF] px-5 text-[11px] font-semibold text-[#171716]"
                >
                  Enter Avantiqo <Arrow className="h-3.5 w-3.5" />
                </a>
                <a
                  href="/creative-studios"
                  className="inline-flex h-11 items-center rounded-xl border border-white/[0.12] bg-white/[0.03] px-5 text-[11px] font-semibold text-white/70"
                >
                  All Creative Studios
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
