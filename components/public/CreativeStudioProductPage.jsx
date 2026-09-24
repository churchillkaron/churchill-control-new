import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";
import Link from "next/link";

const process = [
  ["01", "Brief", "Objective, audience and constraints"],
  ["02", "Research", "Context, references and opportunity"],
  ["03", "Direction", "Creative system and production plan"],
  ["04", "Creation", "Specialist production engines"],
  ["05", "Review", "Critique, quality and continuity"],
  ["06", "Repair", "Targeted correction and refinement"],
  ["07", "Delivery", "Commercial-ready masters and variants"],
];

function studioUseCaseImage(studio, index) {
  const music = [
    "/art/generated/usecases/music-artist-records-v1.png",
    "/art/generated/usecases/music-brand-music-v1.png",
    "/art/generated/usecases/music-film-score-v1.png",
    "/art/generated/usecases/music-vocal-production-v1.png",
    "/art/generated/usecases/music-remix-v1.png",
    "/art/generated/usecases/music-mastering-v1.png",
  ];
  const audio = [
    "/art/generated/usecases/audio-commercial-v1.png",
    "/art/generated/usecases/audio-narrative-v1.png",
    "/art/generated/usecases/audio-automotive-v1.png",
    "/art/generated/usecases/audio-product-launch-v1.png",
    "/art/generated/usecases/audio-immersive-v1.png",
    "/art/generated/usecases/audio-mastering-v1.png",
  ];
  if (studio.startsWith("Music")) return music[index % music.length];
  if (studio.startsWith("Audio")) return audio[index % audio.length];
  return studioImagePath(studio);
}

function StudioUseCaseArt({ studio, index }) {
  const positions = ["center", "58% center", "42% center", "70% center", "35% center", "62% center"];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1B1713]">
      <div
        className="absolute inset-0 bg-cover transition duration-700 group-hover:scale-[1.05]"
        style={{ backgroundImage: `url(${studioUseCaseImage(studio, index)})`, backgroundPosition: positions[index % positions.length] }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.04)_58%,rgba(8,7,6,.34))]" />
      <div className="absolute bottom-3 left-3 h-px w-10 bg-[#D6A66A]/70" />
    </div>
  );
}

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}


function studioImagePath(studio) {
  if (studio.startsWith("Video")) return "/art/generated/creative-video-v2.png";
  if (studio.startsWith("Audio")) return "/art/generated/creative-audio-post-v2.png";
  if (studio.startsWith("Music")) return "/art/generated/creative-music-v2.png";
  if (studio.startsWith("Image")) return "/art/generated/image-studio/workflow/03-create.webp";
  return "/art/generated/image-studio/workflow/01-direct.webp";
}

function StudioArtwork({ studio }) {
  const video = studio.startsWith("Video");
  const audio = studio.startsWith("Audio");
  const music = studio.startsWith("Music");
  const mode = video
    ? "VFX / SIMULATION / COMPOSITE / FINISH"
    : audio
      ? "SOUND DESIGN / POST / SPATIAL / MASTER"
      : music
        ? "RECORD / PRODUCE / MIX / MASTER"
        : "ART DIRECTION / LAYOUT / DELIVERY";
  const caption = video
    ? "Picture craft, not prompt-to-video"
    : audio
      ? "Cinema sound, not a background track"
      : music
        ? "Record production, not AI song generation"
        : "Commercial visual production, not image prompting";
  return (
    <div className="relative min-h-[590px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_100px_rgba(68,47,25,.13)]">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${studioImagePath(studio)})` }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,15,10,.03)_52%,rgba(20,15,10,.22))]" />
      <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-[#F8F0E6]/76 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#8D6339] shadow-sm backdrop-blur-xl">
        AVANTIQO {studio}
      </div>
      <div className="absolute right-5 top-5 hidden rounded-[16px] border border-white/70 bg-[#F8F1E8]/76 px-3 py-2 text-right backdrop-blur-xl sm:block">
        <div className="text-[7px] uppercase tracking-[0.2em] text-[#9A6A37]">{mode}</div>
        <div className="mt-1 text-[8px] text-[#796C5E]">Professional production environment</div>
      </div>
      <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-4 text-[#2B251F] shadow-[0_24px_70px_rgba(40,28,18,.14)] backdrop-blur-xl sm:p-5">
        <div className="flex items-end justify-between gap-5">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#A36F39]">{caption}</div>
            <div className="mt-2 max-w-lg text-[11px] leading-5 text-[#6D6257]">
              Real production state, specialist passes, review evidence and deterministic finishing stay connected from source through master.
            </div>
          </div>
          <div className="hidden gap-1.5 sm:flex">
            {(video ? ["PASSES","COMPOSITE","MASTER"] : audio ? ["DX","FOLEY","SPATIAL","MASTER"] : music ? ["TAKES","MIX","MASTER"] : ["BRIEF","LAYOUT","MASTER"]).map((x) => (
              <span key={x} className="rounded-full border border-[#B98A52]/22 bg-white/55 px-2 py-1 text-[7px] tracking-[0.13em] text-[#796653]">{x}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisciplineGlyph({ studio, index }) {
  const video = studio.startsWith("Video") || studio.startsWith("Audio");
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
  const audio = studio.startsWith("Audio");
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">{video ? "CINEMA / AUDIO ARCHITECTURE" : audio ? "AUDIO POST / PRODUCTION ARCHITECTURE" : "MUSIC / AUDIO ARCHITECTURE"}</p>
            <h2 className="mt-4 max-w-xl text-[40px] font-medium leading-[1.00] tracking-[-0.052em] sm:text-[52px]">
              {(video || audio) ? "Sound is a production department, not a background track." : "Record production, not AI song generation."}
            </h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-[14px] leading-7 text-[#6E675F]">
              {(video || audio)
                ? "Every important object can carry its own sonic identity and evolve with screen position, movement, environment and story. Dialogue, Foley, ambience, effects, music and spatial objects remain separate, editable production layers through premix, multichannel mastering and delivery."
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

        {(video || audio) ? <div className="mt-6 overflow-hidden rounded-[22px] border border-black/[0.08] bg-white/55">
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
    ["01", "Reconstruction execution", "Geometry, depth, masks, motion, lighting and reconstruction tasks become repairable production state."],
    ["02", "Executable pass rendering", "Plate, matte, depth, light, reflection and specialist passes can be dispatched and re-run independently."],
    ["03", "Physical simulation", "Particles, smoke, water, cloth, debris, collisions and atmosphere remain controlled shot layers."],
    ["04", "Deep VFX compositing", "Tracking, roto, keying, cleanup, relighting, integration, atmosphere and shot assembly stay inspectable."],
    ["05", "Sound to picture", "Dialogue, Foley, FX, ambience, movement and music stay attached to picture and timecode."],
    ["06", "Optical finish / Color DI", "Lens response, motion, grain, halation, shot matching, look development and mastering complete the film."],
  ];
  return (
    <section className="border-b border-black/[0.06] bg-[#F3EEE6] text-[#1A1815]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A6531]">VIDEO STUDIO / PRODUCTION ARCHITECTURE</p>
            <h2 className="mt-4 max-w-xl text-[40px] font-medium leading-[1.00] tracking-[-0.052em] sm:text-[52px]">A film-production house with intelligence built into the pipeline.</h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-[14px] leading-7 text-[#6E675F]">Shots are treated as production state: camera intent, reconstruction, VFX passes, simulation, compositing, sound, review and finishing remain connected. Generation is one production department inside the system, not the product itself.</p>
            <div className="mt-5 flex flex-wrap gap-2">{["SHOT RECONSTRUCTION","PASS RENDERING","PHYSICAL SIMULATION","VFX COMPOSITING","SURROUND SOUND","COLOR / DI"].map((x)=><span key={x} className="rounded-full border border-[#B98B58]/25 bg-white/45 px-3 py-1.5 text-[7px] font-semibold tracking-[.14em] text-[#8E663D]">{x}</span>)}</div>
          </div>
        </div>

        <div className="mt-12 overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#FBF8F2] shadow-[0_30px_90px_rgba(62,44,26,.10)]">
          <div className="grid lg:grid-cols-[.92fr_1.08fr]">
            <div className="relative min-h-[520px] overflow-hidden border-b border-black/[0.07] lg:border-b-0 lg:border-r">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/creative-video-v2.png)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.08)_58%,rgba(8,7,6,.52))]"/>
              <div className="absolute left-6 top-6 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[7px] font-semibold tracking-[.16em] text-[#F0C58C] backdrop-blur-xl">PHYSICAL PRODUCTION + VFX</div>
              <div className="absolute bottom-6 left-6 right-6 max-w-[470px] rounded-[20px] border border-white/16 bg-black/32 p-5 text-white backdrop-blur-xl">
                <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#E5BC84]">THE IMAGE TELLS THE PIPELINE</div>
                <p className="mt-3 text-[10px] leading-5 text-white/56">Camera, practical set, lighting, motion control, review and post-production belong to one shot system. The Studio keeps those departments connected so a weak pass can be repaired without destroying accepted work.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2">
              {layers.map(([n,t,d],i)=><div key={t} className={`min-h-[250px] p-6 ${i%2===0 ? "sm:border-r sm:border-black/[0.07]" : ""} ${i<4 ? "border-b border-black/[0.07]" : ""}`}>
                <div className="flex items-center justify-between"><span className="text-[7px] font-bold text-[#A86B2D]">{n}</span><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/60"/></div>
                <h3 className="mt-8 text-[17px] font-semibold tracking-[-0.02em] text-[#28231F]">{t}</h3>
                <p className="mt-3 text-[9px] leading-5 text-[#756E65]">{d}</p>
              </div>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudioTechnicalSpecs({ studio }) {
  const video = studio.startsWith("Video");
  const audio = studio.startsWith("Audio");
  const music = studio.startsWith("Music");
  if (!video && !audio && !music) return null;

  const rows = video ? [
    ["VFX / COMPOSITING", "Mattes · depth · keying · roto · tracking · cleanup · relighting · atmosphere · shot assembly"],
    ["RENDER PASSES", "Plate · depth · matte · geometry · light · reflection · atmosphere · repairable specialist passes"],
    ["PHYSICAL SIMULATION", "Particles · smoke · water · cloth · debris · collisions · atmosphere · light interaction"],
    ["SHOT CONTROL", "Story purpose · camera language · continuity · versions · timecoded review · targeted revision"],
    ["OPTICAL FINISH", "Lens response · motion character · halation · grain · bloom · distortion · chromatic behavior"],
    ["COLOR / DI", "Balance · shot matching · look development · continuity · QC · release master preparation"],
    ["SOUND TO PICTURE", "Dialogue · Foley · FX · ambience · music · object movement · spatial placement · multichannel mix"],
    ["DELIVERY", "Picture masters · channel variants · stems · QC evidence · approved version lineage"],
  ] : audio ? [
    ["CHANNEL LAYOUTS", "Stereo 2.0 · 5.1 · 7.1 · 7.1.4 immersive speaker layouts"],
    ["DIALOGUE / DX", "Editorial · cleanup · timing · continuity · replacement-ready material · dialogue stems"],
    ["FOLEY", "Footsteps · cloth · props · surfaces · machines · vehicles · physical detail"],
    ["SFX / SOUND DESIGN", "Impacts · transitions · mechanical layers · subs · sweeteners · designed effects · source libraries"],
    ["SPATIAL / OBJECT AUDIO", "Object position · trajectory · distance · room response · routing · automation · LFE eligibility"],
    ["MIX ARCHITECTURE", "Multichannel buses · sends · dynamics · reverbs · phase/correlation · stem architecture"],
    ["MASTERING / QC", "Loudness · true peak · dynamic range · mono/downmix checks · translation QC"],
    ["DELIVERY", "DX · FX · MX · M&E stems · stereo/surround/immersive masters · final picture mux packages"],
  ] : [
    ["RECORDING", "24-bit / 48 kHz project standard · takes · overdubs · source health · latency compensation"],
    ["VOCAL PRODUCTION", "Explicit role assignment · lead · double · harmony · backing · ad-lib · choir · vocal master · role-specific EQ/compression · reverb/delay sends · QC blockers"],
    ["MIDI / INSTRUMENTS", "Piano roll · drum sequencer · sampler · groove · harmony · instrument preview · bounce"],
    ["MIX ENGINE", "Parametric EQ · dynamics · groups · sends · automation · pan · stereo/phase monitoring"],
    ["PREMASTER", "Phase · peak · loudness · mono compatibility · critical listening · governed repair"],
    ["MASTERING", "Tone · dynamics · true peak · loudness · translation · release masters · stems"],
  ];

  return (
    <section className="border-b border-black/[0.06] bg-[#FBF8F2] text-[#1A1815]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">TECHNICAL SPECIFICATION</p>
            <h2 className="mt-4 max-w-xl text-[40px] font-medium leading-[1.00] tracking-[-0.052em] sm:text-[52px]">
              {video ? "Film-production depth you can actually inspect." : audio ? "A real cinema-audio chain, not a single generated soundtrack." : "A real record-production chain, not a one-click song generator."}
            </h2>
          </div>
          <p className="max-w-2xl text-[13px] leading-7 text-[#6E675F] lg:justify-self-end">
            {video ? "The Studio exposes the departments behind the final picture so a weak component can be reviewed, repaired and re-rendered without throwing away approved work." : audio ? "Audio stays attached to picture, timecode, routing and source lineage. The same project can move from editorial and sound design through spatial placement, multichannel premix, QC and delivery." : "The Studio keeps recording, performance, arrangement, editing, mixing, premaster review and mastering connected in one production state."}
          </p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-[26px] border border-black/[0.08] bg-black/[0.08] md:grid-cols-2">
          {rows.map(([name,detail])=><div key={name} className="bg-[#F6F1E9] p-5 sm:p-6">
            <div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">{name}</div>
            <p className="mt-3 text-[10px] leading-5 text-[#6D665E]">{detail}</p>
          </div>)}
        </div>
        {audio ? <div className="mt-5 rounded-[18px] border border-[#B98751]/20 bg-white/45 p-5 text-[9px] leading-5 text-[#6C645B]">
          <span className="font-semibold text-[#8A633C]">Dolby Atmos / 7.1.4:</span> Avantiqo can describe and work with 7.1.4 immersive speaker layouts and Atmos-style object/bed production concepts. We should only market a deliverable as <span className="font-semibold">Dolby Atmos certified</span> when the final renderer, monitoring and licensed delivery chain are actually connected and certified.
        </div> : null}
      </div>
    </section>
  );
}


function ProfessionalVocalProduction({ studio }) {
  if (!studio.startsWith("Music")) return null;
  const roles = [
    ["LEAD", "Primary vocal focus"],
    ["DOUBLE", "Controlled reinforcement"],
    ["HARMONY", "Harmonic support"],
    ["BACKING", "Backing-vocal bed"],
    ["AD-LIB", "Accent and response"],
    ["CHOIR", "Grouped vocal ensemble"],
  ];
  return (
    <section className="border-b border-black/[0.06] bg-[#F2ECE3] text-[#1A1815]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-9 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">PROFESSIONAL VOCAL PRODUCTION</p>
            <h2 className="mt-4 max-w-xl text-[40px] font-medium leading-[1.00] tracking-[-0.052em] sm:text-[52px]">A real vocal hierarchy, built deliberately by the engineer.</h2>
          </div>
          <p className="max-w-2xl text-[13px] leading-7 text-[#6E675F] lg:justify-self-end">Avantiqo does not guess vocal roles or silently restructure a session. Vocal tracks are classified explicitly first. The engineer then runs <span className="font-semibold text-[#4A443D]">Build vocal production</span> to create or update the hierarchy deterministically. Any unclassified vocal becomes a QC blocker instead of being routed by assumption.</p>
        </div>

        <div className="mt-10 overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#11100E] text-white shadow-[0_28px_80px_rgba(45,31,18,.15)]">
          <div className="border-b border-white/[0.08] px-6 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">EXPLICIT ROLE VALIDATION</div><div className="mt-2 text-[10px] text-white/38">No role guessing · no source rewriting · no automatic destructive routing</div></div>
              <div className="rounded-full border border-[#D6A66A]/25 px-3 py-1.5 text-[7px] tracking-[.14em] text-[#E3BA82]">ENGINEER ACTION</div>
            </div>
          </div>
          <div className="grid gap-px bg-white/[0.07] sm:grid-cols-3 lg:grid-cols-6">
            {roles.map(([role,copy],i)=><div key={role} className="bg-[#14120F] p-5"><div className="text-[7px] font-bold text-[#D6A66A]">0{i+1}</div><div className="mt-5 text-[10px] font-semibold tracking-[.12em] text-white/74">{role}</div><div className="mt-2 text-[8px] leading-4 text-white/28">{copy}</div></div>)}
          </div>
          <div className="grid lg:grid-cols-[1.2fr_.8fr]">
            <div className="border-b border-white/[0.08] p-6 lg:border-b-0 lg:border-r sm:p-7">
              <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">VOCAL BUS ARCHITECTURE</div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {["Role sub-buses","Vocal master","Role-specific EQ","Role-specific compression","Reverb sends","Delay sends","Automation preserved","Source lineage preserved"].map((x)=><div key={x} className="rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[8px] text-white/46">{x}</div>)}
              </div>
            </div>
            <div className="p-6 sm:p-7">
              <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">QC GATE</div>
              <h3 className="mt-4 text-[24px] font-medium leading-[1.05] tracking-[-.04em] text-white/86">Unclassified vocals block the build.</h3>
              <p className="mt-4 text-[9px] leading-5 text-white/34">The action returns a QC manifest describing missing role assignments and routing blockers. Nothing is guessed from track names, and accepted source audio is not rewritten just to create the hierarchy.</p>
              <div className="mt-6 border-t border-white/[0.07] pt-4 text-[7px] tracking-[.11em] text-white/24">VALIDATE → BUILD SUB-BUSES → VOCAL MASTER → FX SENDS → QC MANIFEST</div>
            </div>
          </div>
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


function ImageStudioPublicExperience() {
  const chain = [
    ["01","Direct","Business goal, audience, brand and creative concept.","/art/generated/image-studio/workflow/01-direct.webp"],
    ["02","Reference","Identity, product, style, composition and location.","/art/generated/image-studio/workflow/02-reference.webp"],
    ["03","Create","Photography, generated or sourced imagery and assets.","/art/generated/image-studio/workflow/03-create.webp"],
    ["04","Compose","Layers, typography, logos, copy and exact layout.","/art/generated/image-studio/workflow/04-compose.webp"],
    ["05","Refine","Retouch, composite, relight, inpaint and outpaint.","/art/generated/image-studio/workflow/05-refine.webp"],
    ["06","Review","Realism, brand, identity, product, copy and technical quality.","/art/generated/image-studio/workflow/06-review.webp"],
    ["07","Adapt","Campaign formats and responsive compositions.","/art/generated/image-studio/workflow/07-adapt.webp"],
    ["08","Release","Deterministic master, preflight, evidence and derivatives.","/art/generated/image-studio/workflow/08-release.webp"],
  ];
  const tools = [
    ["Design & layout",["Layers, alignment and guides","Exact positioning (X/Y/W/H)","Grouping and reusable components","Masks, clipping and focal crop"]],
    ["Typography",["Organization and Avantiqo fonts","Exact text, size and spacing","Text overflow detection","Embedded fonts in export"]],
    ["Image finishing",["Color, light and tone","Retouch and compositing","Inpaint / outpaint / repair","Non-destructive editing"]],
    ["Reference intelligence",["Identity, product and brand roles","Composition, style and location roles","Lock as evidence or inspiration","No style drift into identity"]],
    ["Multi-format export",["Instagram, Facebook and LinkedIn","Stories, Reels and presentations","Print A4 and custom artboards","Responsive adaptation with safe zones"]],
    ["Quality & release",["Structural preflight and validation","Logo, copy and typography checks","Version control and unresolved comments","SHA-256 release package and lineage"]],
  ];
  const technicalSpecs = [
    ["WORKSPACE MODEL","Brief · artboards · assets · references · moodboard · layers · comments · versions · output"],
    ["DESIGN GEOMETRY","Exact X/Y/W/H placement · rotation · source crop · focal crop · clipping · masks · reusable grouped design"],
    ["TYPOGRAPHY ENGINE","Exact font assets · size · weight · line height · letter spacing · alignment · overflow detection · embedded fonts"],
    ["REFERENCE CONTROL","Independent identity · product · brand · composition · style · location reference roles with source-truth boundaries"],
    ["RETOUCH & REPAIR","Non-destructive effects · local inpaint · outpaint / canvas extension · relight · material/color repair · reference-bound correction"],
    ["FORMAT ADAPTATION","Custom artboards · social/feed/story/presentation/print variants · safe-zone checks · crop and layout adaptation"],
    ["QUALITY GATES","Overall 95+ · hero 96 · identity 96 · product 96 · brand 98 · exact copy 100 · typography 100 · logo 100"],
    ["DETERMINISTIC RELEASE","PNG · JPEG quality 95 · PDF · exact embedded fonts · structural preflight · version lineage · governed release evidence"],
  ];
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#191816]">
      <PublicSiteHeader context="Image Studio" audience="creative" links={[{label:"Creative Studios",href:"/creative-studios",visibility:"hidden md:inline-flex"}]} />

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto grid max-w-[1540px] lg:min-h-[630px] lg:grid-cols-[39%_61%]">
          <div className="flex items-center px-5 py-14 sm:px-7 lg:px-10 lg:py-16 xl:px-14">
            <div className="max-w-[580px]">
              <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A7045]">AVANTIQO IMAGE STUDIO</p>
              <h1 className="mt-4 text-[50px] font-medium leading-[.95] tracking-[-.062em] sm:text-[62px] lg:text-[68px]">From creative direction to release-ready master.</h1>
              <p className="mt-5 text-[14px] font-medium text-[#5D5851]">Professional visual production, not prompt-to-image.</p>
              <p className="mt-5 max-w-[545px] text-[12px] leading-6 text-[#6F6961]">Give Avantiqo the business objective, brand evidence, source assets and references. Image Studio directs the work, creates or edits the imagery, builds exact typography and layouts, preserves identity and product truth, reviews the result against quality gates, and produces governed campaign masters and channel variants.</p>
              <div className="mt-7 flex flex-wrap gap-2.5"><Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[10px] font-semibold text-white">Start a project <Arrow className="h-3.5 w-3.5" /></Link><a href="#production-chain" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[10px] font-semibold text-[#56514A]">See production flow</a></div>
              <div className="mt-9 grid grid-cols-3 border-t border-black/[0.08] pt-5">
                {[["100%","Exact copy & logos"],["100%","Typography & governed data"],["95+","Release quality gate"]].map(([v,l],i)=><div key={l} className={`${i?"border-l border-black/[0.08] pl-5":""}`}><div className="text-[20px] font-medium tracking-[-.04em] text-[#B17A42]">{v}</div><div className="mt-1 max-w-[95px] text-[6px] font-semibold uppercase leading-3 tracking-[.14em] text-[#8F887E]">{l}</div></div>)}
              </div>
            </div>
          </div>
          <div className="flex items-center p-5 sm:p-7 lg:pl-0 lg:pr-8">
            <div className="relative min-h-[500px] w-full overflow-hidden rounded-[18px] border border-black/[0.08] bg-[#171614] shadow-[0_28px_70px_rgba(55,36,20,.12)] lg:min-h-[545px]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/image-studio/image-studio-hero-approved.png)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.01),rgba(10,8,6,.05)_56%,rgba(10,8,6,.43))]" />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-5 rounded-[16px] border border-white/12 bg-black/42 p-4 text-white backdrop-blur-xl"><div><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">REAL PRODUCTION ENVIRONMENT</div><div className="mt-2 text-[9px] text-white/55">Photography · composition · typography · review · release</div></div><div className="text-right text-[6px] uppercase tracking-[.14em] text-white/40">Your brand<br/>in professional hands</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="production-chain" className="border-b border-black/[0.06] bg-[#FAF8F4]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">THE PRODUCTION CHAIN</p><h2 className="mt-2 text-[31px] font-medium leading-[1.03] tracking-[-.045em] sm:text-[38px]">A complete workflow. Built for real business.</h2></div><p className="max-w-xl text-[10px] leading-5 text-[#777169] lg:justify-self-end">From strategy and references to final delivery. Every step is controlled, reviewed and built for commercial use.</p></div>
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {chain.map(([n,t,d,img])=><article key={n} className="min-w-0"><div className="relative aspect-[1/1] overflow-hidden rounded-[10px] border border-black/[0.08] bg-[#EDE7DE]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${img})`}} /><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.03),rgba(0,0,0,.18))]" /><span className="absolute left-2 top-2 rounded-full bg-[#F9F6F0]/90 px-2 py-1 text-[7px] font-bold text-[#9A744B]">{n}</span></div><h3 className="mt-3 text-[11px] font-semibold text-[#2F2C29]">{t}</h3><p className="mt-2 text-[8px] leading-4 text-[#817A72]">{d}</p></article>)}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto grid max-w-[1450px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.55fr_1.45fr] lg:px-10 lg:py-20">
          <div className="max-w-[360px]"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">PROFESSIONAL TOOLS.<br/>BUILT FOR CONTROL.</p><h2 className="mt-4 text-[42px] font-medium leading-[.96] tracking-[-.055em]">Real design.<br/>Real precision.</h2><p className="mt-5 text-[10px] leading-5 text-[#706A62]">Image Studio gives you the same control as a professional design and post-production environment, without the overhead. Exact typography, governed assets and non-destructive editing — built for commercial use.</p><a href="#image-studio-tools" className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[10px] font-semibold text-white">Explore the tools <Arrow className="h-3.5 w-3.5" /></a></div>
          <div id="image-studio-tools" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map(([title,items],i)=><article key={title} className="rounded-[18px] border border-black/[0.07] bg-white/70 p-5 shadow-[0_12px_34px_rgba(62,43,24,.035)]"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F0E7D9] text-[10px] font-bold text-[#A37849]">0{i+1}</span><h3 className="text-[11px] font-semibold text-[#302D29]">{title}</h3></div><div className="mt-4 space-y-2">{items.map(x=><div key={x} className="flex gap-2 text-[8px] leading-4 text-[#777169]"><span className="mt-[6px] h-1 w-1 shrink-0 rotate-45 bg-[#B58B5E]" />{x}</div>)}</div></article>)}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBF8F2] text-[#1A1815]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">TECHNICAL SPECIFICATION</p>
              <h2 className="mt-3 max-w-[560px] text-[40px] font-medium leading-[.98] tracking-[-.052em] sm:text-[50px]">The production system behind the image.</h2>
            </div>
            <p className="max-w-2xl text-[11px] leading-6 text-[#6E675F] lg:justify-self-end">Image Studio is built around explicit artboards, layers, governed references, exact typography, non-destructive repair, deterministic export and independent release gates. Weak details can be repaired without throwing away approved work.</p>
          </div>
          <div className="mt-9 grid gap-px overflow-hidden rounded-[24px] border border-black/[0.08] bg-black/[0.08] md:grid-cols-2">
            {technicalSpecs.map(([name,detail])=><div key={name} className="bg-[#F6F1E9] p-5 sm:p-6"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">{name}</div><p className="mt-3 text-[10px] leading-5 text-[#6D665E]">{detail}</p></div>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/[0.07] pt-5 text-[7px] font-semibold uppercase tracking-[.13em] text-[#8D8174]">
            <span>Prompt-free planning</span><span>Independent review</span><span>Bounded repair before regeneration</span><span>Source truth over aesthetic convenience</span><span>Exact copy & data fail closed</span>
          </div>
        </div>
      </section>

      <section className="bg-[#151514] text-white">
        <div className="mx-auto grid max-w-[1450px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.52fr_1.48fr] lg:px-10 lg:py-20">
          <div className="max-w-[390px]"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">COMMERCIAL OUTPUT</p><h2 className="mt-4 text-[39px] font-medium leading-[.98] tracking-[-.05em]">Campaign-ready.<br/>Everywhere you need it.</h2><p className="mt-5 text-[10px] leading-5 text-white/50">Produce one approved master and create governed variants for every channel. Keep brand, product, typography and message consistent — from social to presentation and print.</p><a href="#formats" className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-[10px] font-semibold text-[#191816]">See output examples <Arrow className="h-3.5 w-3.5" /></a></div>
          <div id="formats" className="relative min-h-[420px] overflow-hidden rounded-[20px] border border-white/[0.12] bg-[#0D0D0C] shadow-[0_28px_80px_rgba(0,0,0,.24)]">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/image-studio/workflow/campaign-showcase.webp)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.10)_64%,rgba(0,0,0,.55))]" />
            <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/28 px-3 py-1.5 text-[6px] font-semibold uppercase tracking-[.16em] text-[#E8BF88] backdrop-blur-lg">ONE MASTER · GOVERNED VARIANTS</div>
            <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-4 rounded-[14px] border border-white/12 bg-black/38 p-4 backdrop-blur-xl">
              <div><div className="text-[7px] font-semibold uppercase tracking-[.17em] text-[#D6A66A]">APPROVED CAMPAIGN SYSTEM</div><div className="mt-1 text-[17px] font-medium tracking-[-.03em] text-white/90">Master · Social 4:5 · Story 9:16 · Square 1:1 · Presentation 16:9</div></div>
              <div className="text-[6px] uppercase tracking-[.13em] text-white/38">Same brand · same product · same message</div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-black/[0.06] bg-[#F7F4EE] py-5 text-center text-[7px] font-semibold uppercase tracking-[.24em] text-[#9A9187]">Your vision. Real production. Governed release.</div>
    </main>
  );
}

function VideoStudioPublicExperience() {
  const chain = [
    ["01","Direct","Treatment, story, emotion, pacing and shot purpose.","/art/video-studio/real/direct-storyboard.jpg"],
    ["02","Previsualize","Storyboard, scene plan, camera grammar and continuity.","/art/video-studio/real/previsualize-storyboard.jpg"],
    ["03","Build","Image Studio keyframes, products, characters, environments and source plates.","/art/video-studio/real/build-production.jpg"],
    ["04","Shoot / Generate","Live footage, image-to-video, generated motion and CG renders.","/art/video-studio/real/shoot-camera.jpg"],
    ["05","Reconstruct","Tracking, depth, geometry, roto, masks and camera solve.","/art/video-studio/real/reconstruct-motion-tracking.jpg"],
    ["06","Composite","VFX, simulation, CG integration, atmosphere and relight.","/art/video-studio/real/composite-post.jpg"],
    ["07","Edit / Color","Timeline, shot selection, transitions, pacing, picture lock and Color / DI.","/art/video-studio/real/edit-color.jpg"],
    ["08","Master Audio","Music, dialogue, voice, Foley, SFX and spatial final mix.","/art/video-studio/real/audio-mix.jpg"],
    ["09","Release","Master delivery, derivatives, QC, evidence and publication state.","/art/video-studio/real/release-review.jpg"],
  ];
  const departments = [
    ["Image Studio","Builds the visual truth before motion begins.","Concept frames · keyframes · products · characters · environments · source plates","/creative-studios/image","/art/video-studio/real/build-production.jpg"],
    ["Video Studio","Turns approved visual state into moving cinema.","Direction · cinematography · generation · CG · VFX · edit · Color / DI","/creative-studios/video","/art/video-studio/real/shoot-camera.jpg"],
    ["Music Studio","Creates the emotional score as part of the film.","Original score · performance · arrangement · stems · mix · mastering · picture sync","/creative-studios/music","/art/creative-music.jpg"],
    ["Audio Post","Builds the world you feel and the mix you hear.","Dialogue · ADR · VO · Foley · SFX · acoustics · Stereo · 5.1 · 7.1 · 7.1.4","/creative-studios/audio","/art/video-studio/real/audio-mix.jpg"],
  ];
  const specs = [
    ["DIRECTION & PRODUCTION STATE","Treatment · storyboard · scenes · shots · camera intent · continuity · approved state"],
    ["PICTURE SOURCES","Image Studio frames · live footage · image-to-video · generated footage · CG renders · reference assets"],
    ["3D / VFX","Blender/Cycles · OpenUSD · materials · simulation · tracking · roto · AOVs · compositing · targeted pass repair"],
    ["EDITORIAL","Shot versions · dailies · candidate review · select / reject / repair · timeline · transitions · picture lock"],
    ["COLOR & OPTICAL","ACES / OCIO-aware color · HDR targets · lens response · grain · halation · bloom · distortion · motion character"],
    ["MUSIC & VOICE","Picture-aware score · stems · narration · dialogue · ADR · performance continuity · singing voice in Music Studio"],
    ["AUDIO POST","DX · ADR · VO · Foley · FX · BG · MX buses · HRTF preview · Stereo · 5.1 · 7.1 · native 7.1.4"],
    ["MASTERING & QC","1080p · 2K · 4K · media probe · duration · fps · A/V sync · loudness · true peak · phase · downmix · final mux · lineage"],
  ];
  return (
    <main className="min-h-screen bg-[#F7F3EC] text-[#1A1815]">
      <PublicSiteHeader context="Video Studio" audience="creative" links={[{label:"Creative Studios",href:"/creative-studios",visibility:"hidden md:inline-flex"}]} />

      <section className="border-b border-white/[0.08] bg-[#0D0D0C]">
        <div className="mx-auto grid max-w-[1480px] gap-8 px-5 py-12 sm:px-7 lg:grid-cols-[.7fr_1.3fr] lg:items-stretch lg:px-10 lg:py-16">
          <div className="flex flex-col justify-center py-6 lg:py-10">
            <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">AVANTIQO VIDEO STUDIO</p>
            <h1 className="mt-5 max-w-[610px] text-[54px] font-medium leading-[.94] tracking-[-.06em] text-[#F3E4CF] sm:text-[72px] lg:text-[82px]">From vision to final master.</h1>
            <p className="mt-5 text-[15px] font-medium text-white/[0.88]">An intelligent film-production house.</p>
            <p className="mt-5 max-w-[560px] text-[12px] leading-6 text-white/[0.58]">Direction. Picture. VFX. Music. Voice. Sound. Mastering. Video Studio directs the film while specialist Avantiqo Studios produce the visual, musical and sonic departments — all returning to one governed project, timeline and release master.</p>
            <div className="mt-7 flex flex-wrap gap-2.5"><a href="#film-chain" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#18130E]">Start with the production system <Arrow className="h-3.5 w-3.5" /></a><a href="#departments" className="inline-flex h-11 items-center rounded-xl border border-white/[0.15] bg-white/[0.03] px-5 text-[10px] font-semibold text-white/[0.80]">See connected studios</a></div>
            <div className="mt-10 grid grid-cols-2 gap-5 border-t border-white/[0.09] pt-6 sm:grid-cols-4"><div><div className="text-[20px] text-[#E6B97D]">4K</div><div className="mt-1 text-[6px] uppercase tracking-[.17em] text-white/[0.35]">Master output</div></div><div><div className="text-[20px] text-[#E6B97D]">FULL STACK</div><div className="mt-1 text-[6px] uppercase tracking-[.17em] text-white/[0.35]">Film production</div></div><div><div className="text-[20px] text-[#E6B97D]">5.1 / 7.1 / 7.1.4</div><div className="mt-1 text-[6px] uppercase tracking-[.17em] text-white/[0.35]">Spatial audio</div></div><div><div className="text-[20px] text-[#E6B97D]">ONE PROJECT</div><div className="mt-1 text-[6px] uppercase tracking-[.17em] text-white/[0.35]">Governed state</div></div></div>
          </div>
          <div className="relative min-h-[520px] overflow-hidden rounded-[26px] border border-white/[0.10] bg-[#171614] shadow-[0_30px_90px_rgba(0,0,0,.35)]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/video-studio/real/hero-film-set.jpg)"}}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,13,12,.18),rgba(13,13,12,.04)_45%,rgba(13,13,12,.28)),linear-gradient(180deg,transparent_55%,rgba(0,0,0,.68))]"/><div className="absolute left-5 top-5 rounded-full border border-[#D6A66A]/40 bg-black/[0.35] px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#E5B775] backdrop-blur-lg">FILM PRODUCTION · NOT PROMPT-TO-VIDEO</div><div className="absolute bottom-5 left-5 right-5 rounded-[16px] border border-white/[0.12] bg-black/[0.45] p-4 backdrop-blur-xl"><div className="text-[7px] font-semibold uppercase tracking-[.17em] text-[#D6A66A]">ONE PRODUCTION STATE</div><p className="mt-2 text-[12px] leading-5 text-white/[0.74]">Direction → picture → VFX → edit → music → dialogue → Foley / FX → spatial mix → master → release.</p></div></div>
        </div>
      </section>

      <section id="film-chain" className="border-b border-black/[0.07] bg-[#F7F3EC] text-[#1A1815]">
        <div className="mx-auto max-w-[1480px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">THE FILM PRODUCTION CHAIN</p><h2 className="mt-3 text-[40px] font-medium leading-[.98] tracking-[-.05em] text-[#1D1A17] sm:text-[54px]">From concept to release.</h2></div><p className="max-w-2xl text-[11px] leading-6 text-[#6F685F] lg:justify-self-end">A governed production pipeline. Each stage is powered by the right Avantiqo Studio and returns to the same film project, timeline and release master.</p></div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {chain.map(([n,t,d,img]) => (
              <article key={t} className="overflow-hidden rounded-[18px] border border-black/[0.08] bg-[#FBF8F2] shadow-[0_14px_40px_rgba(46,34,23,.05)]">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#12110F]">
                  <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${img})`}} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,.28))]" />
                  <span className="absolute left-3 top-3 rounded-full border border-white/[0.22] bg-black/[0.42] px-2 py-1 text-[6px] font-semibold text-white/[0.82] backdrop-blur-sm">{n}</span>
                </div>
                <div className="p-4">
                  <h3 className="text-[14px] font-semibold text-[#2B2722]">{t}</h3>
                  <p className="mt-2 text-[8px] leading-4 text-[#746D65]">{d}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="departments" className="border-b border-black/[0.07] bg-[#FBF8F2] text-[#1A1815]">
        <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-7 lg:px-10 lg:py-16">
          <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">ONE FILM · FOUR PRODUCTION DEPARTMENTS</p><h2 className="mt-3 text-[40px] font-medium leading-[.98] tracking-[-.05em] text-[#1D1A17] sm:text-[54px]">Specialist studios. One film.</h2></div><p className="max-w-2xl text-[11px] leading-6 text-[#6F685F] lg:justify-self-end">Video Studio is the conductor. Image, music and audio remain specialist production environments instead of being flattened into one generator.</p></div>
          <div className="mt-8 grid gap-3 lg:grid-cols-4">{departments.map(([name,desc,meta,href,img],i)=><a key={name} href={href} className={`group overflow-hidden rounded-[22px] border bg-white transition hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(46,34,23,.07)] ${i===1?'border-[#D6A66A]/55':'border-black/[0.08]'}`}><div className="relative aspect-[4/3] overflow-hidden bg-[#151513]"><div className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.02]" style={{backgroundImage:`url(${img})`}}/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02)_34%,rgba(0,0,0,.80))]"/><div className="absolute bottom-4 left-4 right-4"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#E5B775]">{name}</div><div className="mt-2 text-[18px] leading-5 text-white">{desc}</div></div></div><div className="p-4"><p className="text-[8px] leading-4 text-[#746D65]">{meta}</p><div className="mt-4 inline-flex items-center gap-2 text-[8px] font-semibold text-[#9A6531]">Explore <Arrow className="h-3 w-3"/></div></div></a>)}</div>
        </div>
      </section>

      <section className="border-b border-white/[0.08] bg-[#121210]">
        <div className="mx-auto max-w-[1480px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20"><div className="grid overflow-hidden rounded-[28px] border border-white/[0.10] bg-[#171614] lg:grid-cols-[.8fr_1.2fr]"><div className="p-7 sm:p-10"><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">PICTURE LOCK</p><h2 className="mt-4 text-[42px] font-medium leading-[.96] tracking-[-.055em] text-[#F3E4CF]">Everything meets at picture lock.</h2><p className="mt-5 max-w-[520px] text-[11px] leading-6 text-white/[0.48]">Picture, music, spoken voice and sound return to the same timeline. Audio Post builds dialogue, Foley, SFX, ambience and world acoustics, then creates stereo, 5.1, 7.1 or native 7.1.4 final mixes before the sealed soundtrack is muxed back to picture.</p><div className="mt-7 space-y-3 text-[9px] text-white/[0.64]">{["Picture lock · Video Studio","Score · Music Studio","Voice / dialogue / ADR · Audio Post","Foley / SFX / world acoustics · Audio Post","Final mix · Stereo / 5.1 / 7.1 / 7.1.4","Master · 4K picture + sealed soundtrack + derivatives"].map((x,i)=><div key={x} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D6A66A]/30 text-[7px] text-[#D6A66A]">{i+1}</span><span>{x}</span></div>)}</div></div><div className="relative min-h-[520px]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/video-studio/real/audio-mix.jpg)"}}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,22,20,.86),rgba(23,22,20,.1)_42%,rgba(23,22,20,.24))]"/><div className="absolute bottom-6 right-6 max-w-[310px] rounded-[16px] border border-white/[0.12] bg-black/[0.45] p-4 backdrop-blur-xl"><div className="text-[8px] font-semibold uppercase tracking-[.17em] text-[#D6A66A]">SEALED SOUNDTRACK</div><div className="mt-2 text-[12px] leading-5 text-white/[0.72]">DX · ADR · VO · Foley · FX · BG · MX · spatial automation · multichannel master</div></div></div></div></div>
      </section>

      <section className="border-b border-black/[0.07] bg-[#F7F3EC] text-[#1A1815]">
        <div className="mx-auto max-w-[1480px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20"><div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A6531]">TECHNICAL SPECIFICATION</p><h2 className="mt-3 max-w-[600px] text-[42px] font-medium leading-[.98] tracking-[-.055em] text-[#1D1A17] sm:text-[52px]">The production system behind the film.</h2></div><p className="max-w-2xl text-[11px] leading-6 text-[#6F685F] lg:justify-self-end">The system preserves approved work, isolates repairable departments and keeps picture, sound, evidence and release state attached to exact versions instead of regenerating the whole film when one detail fails.</p></div><div className="mt-9 grid gap-px overflow-hidden rounded-[24px] border border-black/[0.08] bg-black/[0.07] md:grid-cols-2">{specs.map(([name,detail])=><div key={name} className="bg-[#FBF8F2] p-5 sm:p-6"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">{name}</div><p className="mt-3 text-[9px] leading-5 text-[#746D65]">{detail}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/[0.07] pt-5 text-[7px] font-semibold uppercase tracking-[.13em] text-[#8C8175]"><span>Generation is one department</span><span>Targeted repair before regeneration</span><span>Independent review</span><span>Deterministic final mux</span><span>Deep EXR architecture · certification pending</span></div></div>
      </section>

      <section className="border-b border-white/[0.08] bg-[#11110F] text-white">
        <div className="mx-auto max-w-[1480px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid overflow-hidden rounded-[28px] border border-white/[0.10] bg-[#171614] lg:grid-cols-[1.15fr_.85fr]">
            <div className="relative min-h-[500px]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/video-studio/real/edit-color.jpg)"}}/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.70))]"/><div className="absolute bottom-6 left-6 right-6"><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">FINAL MASTER · GLOBAL DELIVERY</div><h2 className="mt-3 max-w-2xl text-[42px] font-medium leading-[.96] tracking-[-.05em] text-[#F3E4CF]">Ready for every screen. Built for what’s next.</h2><p className="mt-4 max-w-xl text-[10px] leading-5 text-white/[0.62]">One approved film becomes governed cinema, broadcast, streaming, social and presentation derivatives without losing the master state.</p></div></div>
            <div className="flex flex-col justify-center p-7 sm:p-10"><div className="space-y-4">{["4K master · up to 4096×2160","Multiple aspect ratios","HDR / SDR delivery","Stereo / 5.1 / 7.1 / 7.1.4 soundtrack options","Temporal + technical QC","Release lineage and derivatives"].map((x,i)=><div key={x} className="flex items-center gap-3 border-b border-white/[0.08] pb-4 text-[10px] text-white/[0.68]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#D6A66A]/45 text-[7px] text-[#D6A66A]">{i+1}</span><span>{x}</span></div>)}</div></div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.08] bg-[#11110F] text-white"><div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-7 lg:px-10 lg:py-16"><div className="grid gap-4 border-y border-white/[0.09] py-8 sm:grid-cols-3"><div><div className="text-[28px] text-[#E5B775]">Cinematic quality</div><p className="mt-2 text-[9px] text-white/[0.40]">Built for real production. 1080p, 2K and 4K masters with temporal and technical QC.</p></div><div><div className="text-[28px] text-[#E5B775]">Immersive sound</div><p className="mt-2 text-[9px] text-white/[0.40]">Stereo, 5.1, 7.1 and native 7.1.4 with HRTF preview and picture-aware acoustics.</p></div><div><div className="text-[28px] text-[#E5B775]">End-to-end governance</div><p className="mt-2 text-[9px] text-white/[0.40]">From treatment and shot state to master certification, derivatives and release evidence.</p></div></div></div></section>
      <section className="bg-[#F7F3EC] text-[#1A1815]"><div className="mx-auto max-w-[1480px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A6531]">AVANTIQO VIDEO STUDIO</p><h2 className="mx-auto mt-4 max-w-4xl text-[46px] font-medium leading-[.98] tracking-[-.055em] text-[#1D1A17] sm:text-[60px]">Avantiqo does not ask one model to make a movie. It runs a production.</h2><p className="mx-auto mt-5 max-w-2xl text-[11px] leading-6 text-[#6F685F]">One film project connects direction, Image Studio, Video Studio, Music Studio, spoken voice and Audio Post through picture lock, mastering, QC and release.</p><Link href="/login" className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[10px] font-semibold text-white">Start a film project <Arrow className="h-3.5 w-3.5"/></Link></div></section>
    </main>
  );
}


function MusicStudioPublicExperience() {
  const chain = [
    ["01","Source / brief","Start from an idea, existing song, performance, mix, MIDI or picture."],
    ["02","Composition","Original music, songs, melody, harmony, hooks and structure."],
    ["03","Pre-production","Arrangement, instrumentation, groove, MIDI, sampler and sound design."],
    ["04","Record","Vocals and instruments captured as immutable takes with overdubs and take lanes."],
    ["05","Edit & transform","Comping, source cleanup, key/tempo work, time/pitch, non-destructive edits and repair."],
    ["06","Vocals","Lead, doubles, harmony, backing, ad-lib and choir routed deliberately."],
    ["07","Mix","Groups, sends, EQ, dynamics, automation, stereo image, depth and translation."],
    ["08","Master & release","Destination masters, stems, QC, lineage and release packages."],
  ];
  const useCases = [
    ["Artist records","From performance and takes to a finished release master.","/art/generated/usecases/music-artist-records-v1.png"],
    ["Brand music","Ownable sonic identity, themes and campaign music.","/art/generated/usecases/music-brand-music-v1.png"],
    ["Film & campaign score","Music composed to picture, cue points and timecode.","/art/generated/usecases/music-film-score-v1.png"],
    ["Vocal production","Recording, comping, role routing, tuning/timing plans and vocal finishing.","/art/generated/usecases/music-vocal-production-v1.png"],
    ["Remix & alternate versions","Controlled re-production, stems, edits, tempo/key changes and variants.","/art/generated/usecases/music-remix-v1.png"],
    ["Mastering & delivery","Streaming, video, club, live backing and archival master profiles.","/art/generated/usecases/music-mastering-v1.png"],
  ];
  const specs = [
    ["MULTITRACK","Up to 128 tracks · 2048 clips · recording · overdub · take lanes · comping · punch in/out · loop record · clip gain · fades · reverse · warp"],
    ["MIDI & INSTRUMENTS","Piano roll · drum sequencer · groove · harmony · sampler · owned instrument design · MIDI import/export · bounce"],
    ["BACKING & ELASTIC AUDIO","Backing-track workflow · vocal removal · ±12 semitone key shift · tempo ratio · count-in · time-stretch · pitch/key shift · arrangement preservation · stem export"],
    ["VOCAL ENGINEERING","Lead · double · harmony · backing · ad-lib · choir · role sub-buses · vocal master · EQ/compression · reverb/delay sends · source-preserving repair"],
    ["MIX ENGINE","Group buses · reverb/delay auxes · sends · routing · parametric EQ · dynamics · automation · pan · phase/correlation · non-destructive processing"],
    ["LISTENING & REPAIR","Independent listening panel · intended-vs-rendered review · protected ranges · surgical repair · version lineage · originals preserved"],
    ["MASTERING & QC","Streaming · web video · film/video · club · live backing · archival profiles · LUFS · true peak · loudness range · mono/downmix · translation QC"],
    ["RELEASE","Pre-master · master · track stems · group stems · instrumental · acapella · waveform · checksum · technical revalidation · delivery variants"],
    ["READINESS GATES","Stem separation, vocal-role separation, remix, AI edit, extend and some voice paths remain certification / benchmark / research gated until their exact runtime passes readiness."],
  ];
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#191816]">
      <PublicSiteHeader context="Music Studio" audience="creative" links={[{label:"Creative Studios",href:"/creative-studios",visibility:"hidden md:inline-flex"}]} />

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[42%_58%]">
          <div className="flex items-center px-5 py-14 sm:px-7 lg:px-10 lg:py-16 xl:px-14">
            <div className="max-w-[590px]">
              <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A7045]">AVANTIQO MUSIC STUDIO</p>
              <h1 className="mt-4 text-[52px] font-medium leading-[.94] tracking-[-.062em] sm:text-[64px] lg:text-[70px]">From first idea to finished record.</h1>
              <p className="mt-5 text-[14px] font-medium text-[#5D5851]">A complete record-production environment.</p>
              <p className="mt-5 max-w-[550px] text-[12px] leading-6 text-[#6F6961]">Create new music or start from an existing song, performance or mix. Compose, arrange, record, comp, edit, build vocals, create backing tracks, change key or tempo, separate stems, mix, master and deliver inside one governed music project. The Studio preserves original sources, versions, approvals and listening evidence instead of flattening the work into one generated file.</p>
              <div className="mt-7 flex flex-wrap gap-2.5"><Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[10px] font-semibold text-white">Start a music project <Arrow className="h-3.5 w-3.5" /></Link><a href="#music-chain" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[10px] font-semibold text-[#56514A]">See production flow</a></div>
              <div className="mt-9 grid grid-cols-3 border-t border-black/[0.08] pt-5">{[["25","Specialist roles"],["12","Production phases"],["24/48","Project audio standard"]].map(([v,l],i)=><div key={l} className={`${i?"border-l border-black/[0.08] pl-5":""}`}><div className="text-[20px] font-medium tracking-[-.04em] text-[#B17A42]">{v}</div><div className="mt-1 max-w-[105px] text-[6px] font-semibold uppercase leading-3 tracking-[.14em] text-[#8F887E]">{l}</div></div>)}</div>
            </div>
          </div>
          <div className="flex items-center p-5 sm:p-7 lg:pl-0 lg:pr-8">
            <div className="relative min-h-[520px] w-full overflow-hidden rounded-[20px] border border-black/[0.08] bg-[#171614] shadow-[0_28px_70px_rgba(55,36,20,.12)] lg:min-h-[560px]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/creative-music-v2.png)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.08)_52%,rgba(8,7,6,.58))]" />
              <div className="absolute bottom-5 left-5 right-5 rounded-[16px] border border-white/[0.14] bg-black/[0.48] p-4 text-white backdrop-blur-xl"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">ONE MUSIC PROJECT · FULL PRODUCTION STATE</div><div className="mt-2 text-[10px] text-white/[0.62]">Takes · arrangement · MIDI · vocals · mix · master · stems · release lineage</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="music-chain" className="border-b border-black/[0.06] bg-[#FAF8F4]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">THE RECORD-PRODUCTION CHAIN</p><h2 className="mt-2 text-[34px] font-medium leading-[1.02] tracking-[-.048em] sm:text-[42px]">One record. Every department connected.</h2></div><p className="max-w-xl text-[10px] leading-5 text-[#777169] lg:justify-self-end">Music Studio can start from an idea, a performance, MIDI, existing source audio or picture — then preserve the project state through production, review, repair and delivery.</p></div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{chain.map(([n,t,d],i)=><article key={t} className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white"><div className="relative aspect-[16/9] overflow-hidden bg-[#171614]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${studioUseCaseImage("Music Studio",i%6)})`}}/><div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(0,0,0,.42))]"/><span className="absolute left-3 top-3 rounded-full border border-white/[0.18] bg-black/[0.38] px-2 py-1 text-[7px] text-white/[0.82]">{n}</span></div><div className="p-4"><h3 className="text-[13px] font-semibold text-[#2C2925]">{t}</h3><p className="mt-2 text-[8px] leading-4 text-[#787169]">{d}</p></div></article>)}</div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#151412] text-white">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">WORK WITH MUSIC YOU ALREADY HAVE</p>
              <h2 className="mt-3 max-w-[560px] text-[40px] font-medium leading-[.98] tracking-[-.052em] text-[#F3E4CF] sm:text-[50px]">Not only creation. Transform the record you already have.</h2>
            </div>
            <p className="max-w-2xl text-[10px] leading-5 text-white/[0.48] lg:justify-self-end">Upload an existing song or mix and use the same governed production environment to prepare performance versions, change musical key or tempo, separate material, create edits and build new deliverables without losing the original source.</p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Backing tracks","Remove vocals, preserve the arrangement, add count-in and export a performance-ready backing track plus stems."],
              ["Key & tempo","Transpose up to ±12 semitones, change tempo, time-stretch and conform material for the performer or production."],
              ["Stems & isolation","Separate vocals, drums, bass and other material for rehearsal, remixing, editing and production workflows."],
              ["Remix, edit & extend","Rework an existing source, replace selected sections or continue a piece through governed, readiness-gated specialist paths."],
            ].map(([title,copy],i)=><article key={title} className="rounded-[20px] border border-white/[0.09] bg-white/[0.025] p-5"><div className="text-[7px] font-semibold tracking-[.16em] text-[#D6A66A]">0{i+1}</div><h3 className="mt-5 text-[15px] font-semibold text-[#F1E7D8]">{title}</h3><p className="mt-2 text-[9px] leading-5 text-white/[0.42]">{copy}</p></article>)}
          </div>
          <div className="mt-4 rounded-[18px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.045] px-5 py-4 text-[9px] leading-5 text-[#E6CFAB]/72">Existing-audio workflows preserve the uploaded source and require rights confirmation. Some separator, remix, edit and extension paths remain certification or benchmark gated until their exact execution runtime passes readiness.</div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FAF8F4]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">INSIDE MUSIC STUDIO</p>
              <h2 className="mt-3 max-w-[600px] text-[40px] font-medium leading-[.98] tracking-[-.052em] sm:text-[50px]">A full workstation, not one generation button.</h2>
            </div>
            <p className="max-w-2xl text-[10px] leading-5 text-[#6E675F] lg:justify-self-end">The Studio exposes dedicated production rooms for creation, recording, arranging, MIDI, vocals, transformation, mixing, mastering, repair and delivery. The customer does not have to start from a blank song.</p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Create a Song","Composition, form, melody, harmony, rhythm, production direction and original music development."],
              ["Make a Backing Track","Existing song → vocal removal, key/tempo control, count-in, stems and performance-ready exports."],
              ["Record Audio","Take registration, overdubs, punch in/out, loop recording, take lanes and comping."],
              ["Arrangement","Intro / verse / chorus / bridge / breakdown / solo / outro structure with non-destructive material repeats."],
              ["MIDI Studio","Piano roll, drums, groove, harmony, sampler, owned instruments, control automation, import/export and bounce."],
              ["Producer","Production decisions, source readiness, arrangement, musical development and specialist handoff."],
              ["Vocals","Lead, double, harmony, backing, ad-lib and choir roles, pitch/timing analysis, tuning plans and vocal buses."],
              ["Time & Pitch","Elastic audio, key change, tempo change, musical analysis, timing correction and pitch-aware transformation."],
              ["Separate Stems","Vocals, drums, bass and other material for rehearsal, remixing, editing and downstream production."],
              ["Remix / Cover","Rework an existing source into a new musical direction with source preservation and governed planning."],
              ["Edit / Repaint","Replace only the section that needs changing instead of regenerating the whole piece."],
              ["Extend","Continue a source track beyond its ending with temporal continuity controls and explicit readiness gates."],
              ["Mix","Group buses, aux sends, inserts, parametric EQ, dynamics, automation, pan, phase/correlation and master-bus control."],
              ["Master","Destination mastering for streaming, web video, film/video, club, live backing and archival delivery."],
              ["Quality Control","Independent listening, technical validation, intended-vs-rendered review and translation checks."],
              ["Repair & Delivery","Automatic technical repair, surgical repair, version restore, release render, stems, checksums and master lineage."],
            ].map(([title,copy],i)=><article key={title} className="rounded-[19px] border border-black/[0.07] bg-white p-5"><div className="text-[7px] font-semibold tracking-[.16em] text-[#B27A43]">{String(i+1).padStart(2,"0")}</div><h3 className="mt-5 text-[14px] font-semibold text-[#2D2925]">{title}</h3><p className="mt-2 text-[8px] leading-4 text-[#777067]">{copy}</p></article>)}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-[18px] border border-black/[0.07] bg-[#F3EEE6] p-5"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">SOURCE PRESERVATION</div><p className="mt-2 text-[9px] leading-5 text-[#6E675F]">Original audio remains immutable while edits, processing, repairs and versions are tracked separately.</p></div>
            <div className="rounded-[18px] border border-black/[0.07] bg-[#F3EEE6] p-5"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">VERSION LINEAGE</div><p className="mt-2 text-[9px] leading-5 text-[#6E675F]">Approved states, changes, renders, listening evidence and release masters remain connected to exact versions.</p></div>
            <div className="rounded-[18px] border border-[#D6A66A]/28 bg-[#FBF2E5] p-5"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">READINESS-AWARE EXECUTION</div><p className="mt-2 text-[9px] leading-5 text-[#6E675F]">Capabilities that still require separator certification, benchmark evidence or human listening approval stay visibly gated instead of being silently substituted.</p></div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">WHAT IT CAN PRODUCE</p><h2 className="mt-2 max-w-3xl text-[36px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[44px]">Music built for artists, brands, film and live performance.</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{useCases.map(([name,copy,img],i)=><article key={name} className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white"><div className="relative aspect-[16/9] overflow-hidden"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${img})`}}/><div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,.44))]"/><span className="absolute left-3 top-3 rounded-full border border-white/[0.20] bg-black/[0.35] px-2 py-1 text-[7px] text-white/[0.78]">0{i+1}</span></div><div className="p-5"><h3 className="text-[15px] font-semibold text-[#2C2925]">{name}</h3><p className="mt-2 text-[9px] leading-5 text-[#746D65]">{copy}</p></div></article>)}</div>
        </div>
      </section>

      <section className="bg-[#141311] text-white">
        <div className="mx-auto grid max-w-[1450px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-20">
          <div className="max-w-[420px]"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">THE ENGINEERING ROOM</p><h2 className="mt-4 text-[43px] font-medium leading-[.96] tracking-[-.055em] text-[#F3E4CF]">Record. Shape. Mix. Master.</h2><p className="mt-5 text-[10px] leading-5 text-white/[0.50]">The browser preview is not the release master. The Studio keeps source, routing, automation, buses, versions and release rendering explicit so approved work can be repaired without destroying the session.</p></div>
          <div className="grid gap-px overflow-hidden rounded-[24px] border border-white/[0.10] bg-white/[0.08] sm:grid-cols-2">{[["Recording","Immutable takes · overdubs · punch · loop record · latency compensation"],["Arrangement & MIDI","Structure · groove · harmony · piano roll · drums · sampler · instruments"],["Vocal production","Role hierarchy · comping · source cleanup · timing/pitch plans · vocal buses"],["Mix architecture","Groups · aux sends · EQ · dynamics · automation · stereo/phase monitoring"],["Premaster review","Independent listening · intended-vs-rendered · translation · targeted repair"],["Master & release","Destination profiles · LUFS · true peak · stems · delivery variants · lineage"]].map(([t,c])=><div key={t} className="bg-[#171614] p-5 sm:p-6"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#D6A66A]">{t}</div><p className="mt-3 text-[9px] leading-5 text-white/[0.46]">{c}</p></div>)}</div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBF8F2]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">TECHNICAL SPECIFICATION</p><h2 className="mt-3 max-w-[560px] text-[40px] font-medium leading-[.98] tracking-[-.052em] sm:text-[50px]">The production system behind the record.</h2></div><p className="max-w-2xl text-[11px] leading-6 text-[#6E675F] lg:justify-self-end">Music Studio is built around non-destructive project state, source preservation, exact routing, independent listening, governed repair and release-specific mastering rather than one generic output.</p></div>
          <div className="mt-9 grid gap-px overflow-hidden rounded-[24px] border border-black/[0.08] bg-black/[0.08] md:grid-cols-2">{specs.map(([name,detail])=><div key={name} className="bg-[#F6F1E9] p-5 sm:p-6"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">{name}</div><p className="mt-3 text-[10px] leading-5 text-[#6D665E]">{detail}</p></div>)}</div>
        </div>
      </section>

      <section className="bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="relative overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#171614] px-6 py-14 text-center text-white sm:px-10 lg:py-16"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(214,166,106,.18),transparent_38%)]"/><div className="relative"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">AVANTIQO MUSIC STUDIO</p><h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.01] tracking-[-.05em] text-[#F3E4CF] sm:text-[50px]">Produce the record, not just the song.</h2><p className="mx-auto mt-4 max-w-xl text-[10px] leading-5 text-white/[0.46]">One project for creation, existing-song transformation, backing tracks, recording, MIDI, vocals, arrangement, mix, master, stems, repair and delivery.</p><Link href="/login" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#E4B36F] px-5 text-[10px] font-semibold text-[#17130E]">Start a music project <Arrow className="h-3.5 w-3.5" /></Link></div></div>
        </div>
      </section>
    </main>
  );
}


function AudioStudioPublicExperience() {
  const chain = [
    ["01","Spot","Lock picture, timecode, cues, dialogue, music and sonic intent."],
    ["02","Dialogue / ADR","Edit production dialogue, prepare replacement material and match ADR continuity."],
    ["03","Foley","Build footsteps, cloth, props, surfaces, machines, vehicles and tactile detail."],
    ["04","Sound design","Create impacts, transitions, mechanical layers, subs, sweeteners and designed effects."],
    ["05","World acoustics","Model perspective, occlusion, room behavior, reflection and picture-aware acoustic change."],
    ["06","Spatial mix","Position and automate sound through stereo, HRTF preview and multichannel speaker layouts."],
    ["07","Premix / re-record","Route DX, ADR, VO, Foley, FX, backgrounds and music through controlled buses and stems."],
    ["08","Master & deliver","Validate loudness, true peak, phase, downmix, stems, multichannel masters and final picture mux."],
  ];
  const useCases = [
    ["Dialogue & ADR","Production dialogue cleanup, timing, continuity, ADR recording/matching and source-preserving repair.","/art/audio-post/real/usecase-dialogue-adr.jpg"],
    ["Foley & tactile sound","Footsteps, cloth, props, surfaces, impacts and physical detail built as editable production layers.","/art/audio-post/real/usecase-foley-tactile.jpg"],
    ["Cinematic sound design","Machines, vehicles, transitions, impacts, low-end design, ambience and editorial effects.","/art/audio-post/real/usecase-sound-design.jpg"],
    ["Premix & final mix","Dialogue-priority routing, buses, sends, automation, reverbs, dynamics and picture-locked balancing.","/art/audio-post/real/usecase-premix-final.jpg"],
    ["Immersive production","HRTF binaural preview plus stereo, 5.1, 7.1 and 7.1.4 production with picture-aware movement and room behavior.","/art/audio-post/real/usecase-immersive.jpg"],
    ["Mastering & versioning","DX / FX / MX / M&E stems, loudness and true-peak validation, downmix QC, versions and picture-ready delivery.","/art/audio-post/real/usecase-mastering.jpg"],
  ];
  const specs = [
    ["PICTURE & TIMECODE","Spotting · picture lock · cue timing · sample-accurate placement · source lineage · version state"],
    ["DIALOGUE / ADR","DX editorial · cleanup · timing · continuity · ADR matching · replacement-ready material · dialogue stems"],
    ["FOLEY","Footsteps · cloth · props · surfaces · machines · vehicles · tactile detail · picture sync"],
    ["SFX / SOUND DESIGN","Impacts · transitions · mechanical layers · subs · sweeteners · designed effects · ambience · source libraries"],
    ["WORLD ACOUSTICS","Material-aware occlusion · attenuation · high-frequency loss · changing room/reflection behavior · acoustic continuity"],
    ["SPATIAL / OBJECT AUDIO","Screen position · trajectory · distance · automation · room response · HRTF preview · LFE eligibility"],
    ["MIX ARCHITECTURE","DX · ADR · VO · Foley · FX · BG · MX buses · sends · dynamics · reverbs · phase/correlation · stem architecture"],
    ["MASTERING & QC","Stereo · 5.1 · 7.1 · 7.1.4 · loudness · true peak · dynamic range · mono/downmix · translation QC · final mux"],
  ];
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#191816]">
      <PublicSiteHeader context="Audio Post" audience="creative" links={[{label:"Creative Studios",href:"/creative-studios",visibility:"hidden md:inline-flex"}]} />

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[42%_58%]">
          <div className="flex items-center px-5 py-14 sm:px-7 lg:px-10 lg:py-16 xl:px-14">
            <div className="max-w-[600px]">
              <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A7045]">AVANTIQO AUDIO POST</p>
              <h1 className="mt-4 text-[52px] font-medium leading-[.94] tracking-[-.062em] sm:text-[64px] lg:text-[70px]">Build the world you hear.</h1>
              <p className="mt-5 text-[14px] font-medium text-[#5D5851]">A complete sound-to-picture production environment.</p>
              <p className="mt-5 max-w-[560px] text-[12px] leading-6 text-[#6F6961]">Audio stays locked to picture and timecode from spotting through final master. Dialogue, ADR, Foley, ambience, designed SFX, music, object movement, world acoustics, routing, automation, premix, spatial monitoring, multichannel mastering, stems and QC remain connected in one governed project.</p>
              <div className="mt-7 flex flex-wrap gap-2.5"><Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[10px] font-semibold text-white">Start an audio project <Arrow className="h-3.5 w-3.5" /></Link><a href="#audio-chain" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[10px] font-semibold text-[#56514A]">See production flow</a></div>
              <div className="mt-9 grid grid-cols-3 border-t border-black/[0.08] pt-5">{[["DX→MX","Full post chain"],["HRTF","Binaural preview"],["5.1 / 7.1 / 7.1.4","Multichannel"]].map(([v,l],i)=><div key={l} className={`${i?"border-l border-black/[0.08] pl-5":""}`}><div className="text-[18px] font-medium tracking-[-.04em] text-[#B17A42]">{v}</div><div className="mt-1 max-w-[120px] text-[6px] font-semibold uppercase leading-3 tracking-[.14em] text-[#8F887E]">{l}</div></div>)}</div>
            </div>
          </div>
          <div className="flex items-center p-5 sm:p-7 lg:pl-0 lg:pr-8">
            <div className="relative min-h-[520px] w-full overflow-hidden rounded-[22px] border border-black/[0.08] bg-[#171614] shadow-[0_28px_70px_rgba(55,36,20,.12)] lg:min-h-[560px]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/audio-post/real/hero-control-room.jpg)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.05)_48%,rgba(8,7,6,.62))]" />
              <div className="absolute bottom-5 left-5 right-5 rounded-[16px] border border-white/[0.14] bg-black/[0.48] p-4 text-white backdrop-blur-xl"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">PICTURE-LOCKED SOUND · SOURCE TO MASTER</div><div className="mt-2 text-[10px] text-white/[0.62]">DX · ADR · Foley · FX · ambience · music · spatial mix · stems · master</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="audio-chain" className="border-b border-black/[0.06] bg-[#FAF8F4]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">THE SOUND-TO-PICTURE CHAIN</p><h2 className="mt-2 text-[34px] font-medium leading-[1.02] tracking-[-.048em] sm:text-[42px]">From picture lock to final mix.</h2></div><p className="max-w-xl text-[10px] leading-5 text-[#777169] lg:justify-self-end">Each department stays editable and versioned, so dialogue, Foley, acoustics, spatial movement or mastering can be repaired without flattening the entire soundtrack.</p></div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{chain.map(([n,t,d],i)=><article key={t} className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white"><div className="relative aspect-[16/9] overflow-hidden bg-[#171614]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${["/art/audio-post/real/spot-sound-session.jpg","/art/audio-post/real/dialogue-adr-session.jpg","/art/audio-post/real/foley-footsteps-real.jpg","/art/audio-post/real/sound-design-edit.jpg","/art/audio-post/real/world-acoustics-room.jpg","/art/audio-post/real/spatial-mix-monitoring.jpg","/art/audio-post/real/premix-rerecord-team.jpg","/art/audio-post/real/mastering-delivery-qc.jpg"][i]})`,filter:"saturate(.82) contrast(1.03) brightness(.92)"}}/><div className="absolute inset-0 bg-[#5A3A22]/[0.08] mix-blend-multiply"/><div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,.38))]"/><span className="absolute left-3 top-3 rounded-full border border-white/[0.18] bg-black/[0.38] px-2 py-1 text-[7px] text-white/[0.82]">{n}</span></div><div className="p-4"><h3 className="text-[13px] font-semibold text-[#2C2925]">{t}</h3><p className="mt-2 text-[8px] leading-4 text-[#787169]">{d}</p></div></article>)}</div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">INSIDE AUDIO POST</p><h2 className="mt-2 max-w-3xl text-[36px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[44px]">A real post-production department, not an effect added at the end.</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{useCases.map(([name,copy,img],i)=><article key={name} className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white"><div className="relative aspect-[16/9] overflow-hidden"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${img})`,filter:"saturate(.82) contrast(1.03) brightness(.92)"}}/><div className="absolute inset-0 bg-[#5A3A22]/[0.08] mix-blend-multiply"/><div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,.42))]"/><span className="absolute left-3 top-3 rounded-full border border-white/[0.20] bg-black/[0.35] px-2 py-1 text-[7px] text-white/[0.78]">0{i+1}</span></div><div className="p-5"><h3 className="text-[15px] font-semibold text-[#2C2925]">{name}</h3><p className="mt-2 text-[9px] leading-5 text-[#746D65]">{copy}</p></div></article>)}</div>
        </div>
      </section>

      <section className="bg-[#141311] text-white">
        <div className="mx-auto grid max-w-[1450px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-20">
          <div className="max-w-[440px]"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">PICTURE-AWARE ACOUSTICS</p><h2 className="mt-4 text-[43px] font-medium leading-[.96] tracking-[-.055em] text-[#F3E4CF]">Sound changes when the world changes.</h2><p className="mt-5 text-[10px] leading-5 text-white/[0.50]">Walls, glass, wood, vehicle bodies, brick, concrete, metal and curtains can affect attenuation, high-frequency loss and occlusion. Room and reflection behavior can evolve with picture instead of staying as one static reverb.</p></div>
          <div className="relative min-h-[470px] overflow-hidden rounded-[24px] border border-white/[0.10]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/audio-post/real/mix-console.jpg)"}}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,19,17,.78),rgba(20,19,17,.18)_48%,rgba(20,19,17,.35))]"/><div className="absolute bottom-6 left-6 right-6 grid gap-px overflow-hidden rounded-[16px] border border-white/[0.10] bg-white/[0.08] sm:grid-cols-4">{[["OCCLUSION","Material + movement"],["PERSPECTIVE","Distance + screen relation"],["ROOM","Reflection + tone"],["AUTOMATION","Picture-locked change"]].map(([a,b])=><div key={a} className="bg-black/[0.48] p-4 backdrop-blur-md"><div className="text-[7px] font-semibold tracking-[.15em] text-[#D6A66A]">{a}</div><div className="mt-2 text-[8px] text-white/[0.45]">{b}</div></div>)}</div></div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBF8F2]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">TECHNICAL SPECIFICATION</p><h2 className="mt-3 max-w-[560px] text-[40px] font-medium leading-[.98] tracking-[-.052em] sm:text-[50px]">The production system behind the soundtrack.</h2></div><p className="max-w-2xl text-[11px] leading-6 text-[#6E675F] lg:justify-self-end">Original sources remain preserved while processing, matched ADR, repairs, automation, mixes, stems and masters remain versioned and reviewable.</p></div>
          <div className="mt-9 grid gap-px overflow-hidden rounded-[24px] border border-black/[0.08] bg-black/[0.08] md:grid-cols-2">{specs.map(([name,detail])=><div key={name} className="bg-[#F6F1E9] p-5 sm:p-6"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">{name}</div><p className="mt-3 text-[10px] leading-5 text-[#6D665E]">{detail}</p></div>)}</div>
          <div className="mt-5 rounded-[18px] border border-[#B98751]/20 bg-white/50 p-5 text-[9px] leading-5 text-[#6C645B]"><span className="font-semibold text-[#8A633C]">Dolby Atmos:</span> 7.1.4 and object/bed production concepts can be used in the Studio. A deliverable should only be marketed as Dolby Atmos certified when the licensed Dolby renderer, monitoring and delivery chain are actually connected and certified.</div>
        </div>
      </section>

      <section className="bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20"><div className="relative overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#171614] px-6 py-14 text-center text-white sm:px-10 lg:py-16"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(214,166,106,.18),transparent_38%)]"/><div className="relative"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">AVANTIQO AUDIO POST</p><h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.01] tracking-[-.05em] text-[#F3E4CF] sm:text-[50px]">Build the world, not just the audio track.</h2><p className="mx-auto mt-4 max-w-xl text-[10px] leading-5 text-white/[0.46]">One project from spotting and source audio through dialogue, Foley, world acoustics, spatial mix, multichannel master and delivery.</p><Link href="/login" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#E4B36F] px-5 text-[10px] font-semibold text-[#17130E]">Start an audio project <Arrow className="h-3.5 w-3.5" /></Link></div></div></div>
      </section>
    </main>
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
  if (studio.startsWith("Image")) return <ImageStudioPublicExperience />;
  if (studio.startsWith("Video")) return <VideoStudioPublicExperience />;
  if (studio.startsWith("Music")) return <MusicStudioPublicExperience />;
  if (studio.startsWith("Audio")) return <AudioStudioPublicExperience />;
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-[1460px] items-center justify-between px-5 sm:px-7 lg:px-10">
          <Link href="/" className="flex items-center gap-3"><span className="rounded-xl bg-[#171716] px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,.08)]"><Image src="/branding/avantiqo-wordmark.png" alt="Avantiqo" width={126} height={10} className="h-[10px] w-auto object-contain" priority /></span><div className="hidden text-[7px] font-semibold uppercase tracking-[0.18em] text-[#9A744B] sm:block">{studio}</div></Link>
          <nav className="flex items-center gap-1"><Link href="/creative-studios" className="hidden rounded-lg px-3 py-2 text-[10px] text-[#6C6963] hover:bg-white md:inline-flex">Creative Studios</Link><Link href="/developers" className="hidden rounded-lg px-3 py-2 text-[10px] text-[#6C6963] hover:bg-white lg:inline-flex">Developers</Link><Link href="/" className="hidden rounded-lg px-3 py-2 text-[10px] text-[#6C6963] hover:bg-white xl:inline-flex">Platform</Link><Link href="/login" className="ml-1 inline-flex h-9 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[10px] font-semibold text-white">Login <Arrow className="h-3 w-3" /></Link></nav>
        </div>
      </header>

      <section className="border-b border-black/[0.06] bg-[#F7F6F3]">
        <div className="mx-auto grid max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-24">
          <div className="max-w-[690px]"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">Avantiqo {studio}</p><h1 className="mt-5 text-[48px] font-medium leading-[.98] tracking-[-0.055em] text-[#181817] sm:text-[62px] lg:text-[72px]">{title}</h1><p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8D643C]">{subtitle}</p><p className="mt-6 max-w-xl text-[16px] leading-8 text-[#625F59]">{description}</p><div className="mt-8 flex flex-wrap gap-2.5"><a href="#capabilities" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Explore {studio} <Arrow className="h-3.5 w-3.5" /></a><a href="#process" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">See production flow</a></div></div>
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
            {studio.startsWith("Video") ? "Not a generator. A complete film-production system." : studio.startsWith("Audio") ? "Not an audio effect. A complete sound-to-picture production system." : studio.startsWith("Music") ? "Not an AI song generator. A complete record-production system." : "Not a generator. A professional creative workflow."}
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

      {(studio.startsWith("Video") || studio.startsWith("Music") || studio.startsWith("Audio")) ? <SharedAudioArchitecture studio={studio} /> : null}

      <StudioTechnicalSpecs studio={studio} />

      <ProfessionalVocalProduction studio={studio} />

      <StudioWorkspace studio={studio} />

      <section id="process" className="border-b border-black/[0.06] bg-[#F7F6F3]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">From idea to impact</p><h2 className="mt-3 text-[36px] font-medium tracking-[-0.045em] sm:text-[46px]">One connected production path.</h2><div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-7">{process.map(([n,t,d])=><div key={t} className="rounded-[20px] border border-black/[0.075] bg-white p-4"><div className="text-[8px] font-bold text-[#A37849]">{n}</div><h3 className="mt-6 text-[13px] font-semibold">{t}</h3><p className="mt-2 text-[9px] leading-4 text-[#817B73]">{d}</p></div>)}</div></div></section>

      <section className="border-b border-black/[0.06] bg-[#F4F0E8] text-[#1A1815]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A6531]">
            Real business use
          </p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1C1916] sm:text-[46px]">
            Creative output built to do a job.
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map(([name, text], index) => (
              <div
                key={name}
                className="group rounded-[20px] border border-black/[0.07] bg-[#FBF8F2] p-5 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35 hover:shadow-[0_16px_40px_rgba(61,45,27,.07)]"
              >
                <div className="relative h-44 overflow-hidden rounded-[16px] border border-black/[0.07] bg-[#15120e]">
                  <StudioUseCaseArt studio={studio} index={index} />
                  <div className="absolute left-3 top-3 rounded-full border border-white/70 bg-[#F8F0E6]/72 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.15em] text-[#8D6339] backdrop-blur-xl">
                    0{index + 1}
                  </div>
                </div>
                <h3 className="mt-5 text-[14px] font-semibold text-[#2E2924]">
                  {name}
                </h3>
                <p className="mt-2 text-[10px] leading-5 text-[#746D65]">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]"><div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-24"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Creative capability, anywhere</p><h2 className="mt-3 max-w-2xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">Use the Studio in Avantiqo or connect it to your own product.</h2><p className="mt-5 max-w-xl text-[14px] leading-7 text-[#6C6963]">The same governed creative capability can power a Studio mission, an API workflow, an agent tool or an embedded customer experience.</p><Link href="/developers" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Explore developer access <Arrow className="h-3.5 w-3.5" /></Link></div><div className="grid gap-3 sm:grid-cols-2">{[["01","Studio mission","Full creative production inside Avantiqo."],["02","API workflow","Call certified creative capabilities from software."],["03","Agent tool","Give an agent governed creative execution."],["04","Embedded experience","Bring selected production flows into another product."]].map(([n,t,d])=><div key={t} className="rounded-[20px] border border-black/[0.075] bg-white p-5"><div className="text-[8px] font-bold text-[#A37849]">{n}</div><h3 className="mt-5 text-[14px] font-semibold text-[#302D29]">{t}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{d}</p></div>)}</div></div></section>

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
          <div className="relative overflow-hidden rounded-[34px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F1E4D2_58%,#E5C69B_100%)] px-6 py-16 text-center text-[#1D1B18] shadow-[0_28px_90px_rgba(46,34,23,.08)] sm:px-10 lg:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(214,166,106,.18),transparent_38%)]" />
            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
                A more creative tomorrow
              </p>
              <h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#1D1B18] sm:text-[50px]">
                {cta}
              </h2>
              <div className="mx-auto mt-5 h-px max-w-sm bg-gradient-to-r from-transparent via-[#D6A66A]/38 to-transparent" />
              <div className="mt-8 flex flex-wrap justify-center gap-2.5">
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[11px] font-semibold text-white"
                >
                  Enter Avantiqo <Arrow className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/creative-studios"
                  className="inline-flex h-11 items-center rounded-xl border border-black/[0.10] bg-white/58 px-5 text-[11px] font-semibold text-[#5B5249]"
                >
                  All Creative Studios
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
