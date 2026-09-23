"use client";

const PRESETS = {
  "conservative-premium": { bg:"#F4F0E8",surface:"#FBF8F2",ink:"#171612",muted:"#696258",accent:"#9A754A",accentSoft:"#E7D8C5",border:"#DDD4C8",dark:"#1B1A17" },
  "executive-modern": { bg:"#ECEDE9",surface:"#F8F8F5",ink:"#111512",muted:"#5D655F",accent:"#667568",accentSoft:"#D9DFD9",border:"#D4D8D3",dark:"#18201B" },
  "editorial-luxury": { bg:"#F5F2EC",surface:"#FCFBF8",ink:"#171A18",muted:"#626860",accent:"#5F2A2A",accentSoft:"#E8DDDA",border:"#D9D7D0",dark:"#18201C" },
};

const DIRECTION_PALETTES = {
  "forest-natural": { bg:"#F2F4EE",surface:"#FAFBF7",ink:"#162018",muted:"#667067",accent:"#496447",accentSoft:"#DCE5D7",border:"#D5DDD2",dark:"#132018" },
  "clinical-clean": { bg:"#F4FAFB",surface:"#FFFFFF",ink:"#10272C",muted:"#60777D",accent:"#197184",accentSoft:"#D8EEF2",border:"#D3E5E8",dark:"#0D2A31" },
  "industrial-neutral": { bg:"#F1F0EC",surface:"#F9F8F5",ink:"#1E1D1A",muted:"#6E6A62",accent:"#7E5F3F",accentSoft:"#E8DED0",border:"#D7D2C8",dark:"#1D1C19" },
  "warm-luxury": { bg:"#F7F0EA",surface:"#FFF9F4",ink:"#251A16",muted:"#76655D",accent:"#9B4E32",accentSoft:"#F1DDD2",border:"#E5D3C9",dark:"#2A1712" },
  "coastal-light": { bg:"#F2F8F8",surface:"#FBFFFF",ink:"#153039",muted:"#66808A",accent:"#2C8194",accentSoft:"#DCEFF2",border:"#D2E3E6",dark:"#12323B" },
  "bold-retail": { bg:"#FFF7F2",surface:"#FFFFFF",ink:"#211715",muted:"#755F59",accent:"#E24A2A",accentSoft:"#FFE0D5",border:"#F0D3C9",dark:"#251613" },
  "midnight-cobalt": { bg:"#0A1020",surface:"#101A31",ink:"#F7F2E8",muted:"#A9B4C9",accent:"#FF6B35",accentSoft:"#262E54",border:"#26324D",dark:"#050914" },
  "sunlit-yellow": { bg:"#F2E957",surface:"#FFFBE2",ink:"#141414",muted:"#5B5735",accent:"#0F4C81",accentSoft:"#E5DC5B",border:"#B8AE36",dark:"#161616" },
  "terracotta-paper": { bg:"#E8D8C2",surface:"#F5EBDD",ink:"#231C18",muted:"#6D5A4E",accent:"#B94F2F",accentSoft:"#D9BAA5",border:"#C7AF9B",dark:"#30231C" },
  "monochrome-editorial": { bg:"#F4F4F0",surface:"#FFFFFF",ink:"#0A0A0A",muted:"#666662",accent:"#0A0A0A",accentSoft:"#DEDEDA",border:"#CFCFC9",dark:"#0A0A0A" },
  "ink-red": { bg:"#F1ECE3",surface:"#F8F4EC",ink:"#161616",muted:"#696159",accent:"#C23B2A",accentSoft:"#E6C7BF",border:"#D2C7BB",dark:"#171717" },
  "polar-blue": { bg:"#DDECF5",surface:"#F4FBFF",ink:"#082A38",muted:"#4D6F7D",accent:"#006B7A",accentSoft:"#B8DDE4",border:"#B9D1DA",dark:"#082A38" },
};

function paletteFor(schema) {
  const style = schema?.style_dna;
  const custom = style?.palette || {};
  const valid = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ""));
  const normalized = [custom.background, custom.surface, custom.ink, custom.accent, custom.secondary]
    .map((value) => String(value || "").toUpperCase());
  const neutralFallback = ["#F3F5F7", "#FFFFFF", "#15191E", "#386B7A", "#7C8A91"];
  const customValid = normalized.every(valid);
  const customIsNeutralFallback = normalized.every((value, index) => value === neutralFallback[index]);
  if (customValid && !customIsNeutralFallback) {
    return {
      bg: custom.background,
      surface: custom.surface,
      ink: custom.ink,
      muted: custom.secondary,
      accent: custom.accent,
      accentSoft: custom.secondary,
      border: custom.secondary,
      dark: custom.ink,
    };
  }
  return DIRECTION_PALETTES[schema?.color_direction] || PRESETS[schema?.variant] || PRESETS["editorial-luxury"];
}

function navLabelsFor(schema) {
  const signal = [schema?.industry, schema?.design_family, schema?.business_model].join(" ").toLowerCase();
  if (/travel|tourism|destination/.test(signal)) return ["Journeys", "Places", "Stories", "About"];
  if (/hotel|hospitality|lodge|resort/.test(signal)) return ["Stay", "Experiences", "Journal", "About"];
  if (/food|restaurant|cafe|bar/.test(signal)) return ["Menu", "Story", "Visit", "Journal"];
  if (/account|finance|legal|consult|professional/.test(signal)) return ["Expertise", "Approach", "Insights", "About"];
  return ["Work", "Approach", "Journal", "About"];
}

function contactLabelFor(schema) {
  const signal = [schema?.industry, schema?.business_model, schema?.conversion_goal].join(" ").toLowerCase();
  if (/travel|tourism|destination/.test(signal)) return "Explore";
  if (/hotel|hospitality|lodge|resort|reserve/.test(signal)) return "Reserve";
  if (/food|restaurant|visit/.test(signal)) return "Visit";
  return "Contact";
}

function clean(value, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function humanLabel(value, fallback = "") {
  const source = clean(value, fallback).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return source.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeClaim(value, fallback = "") {
  const result = clean(value, fallback);
  return unsupportedClaim(result) ? fallback : result;
}

function cards(value, fallback) {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .slice(0, 4)
    .map((item, index) => ({
      title: unsupportedClaim(item?.title) ? clean(fallback?.[index]?.title) : clean(item?.title),
      body: unsupportedClaim(item?.body) ? clean(fallback?.[index]?.body) : clean(item?.body),
    }))
    .filter((item) => item.title && item.body);
  return normalized.length ? normalized : fallback;
}

function unsupportedClaim(value) {
  return /\d|%|\b(thousand|million|decade|free|client|clients|customer|customers|verified|certified|certification|licensed|insured|safe|non[- ]toxic|chemical[- ]free|eco[- ]friendly|no hidden fees?|24\s*\/\s*7|within\s+\w+\s+(?:hour|minute|day)s?|guarantee|guaranteed|trusted by|proven results?|real results?|same[- ]day|audited|audit-backed|measured|validated|accredited)\b|\b(local leaders?|communities?|community partners?|guides?|experts?)\b.{0,36}\b(confirm|confirms|confirmed|verify|verifies|verified|prove|proves|proven|ensure|ensures|support|supports)\b/i.test(String(value || ""));
}

function stats(value, fieldService = false) {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .slice(0, 3)
    .map((item) => ({
      value: clean(item?.value),
      label: clean(item?.label),
    }))
    .filter((item) => item.value && item.label && !unsupportedClaim(item.value) && !unsupportedClaim(item.label));
  return normalized.length === 3 ? normalized : fieldService ? [
    { value: "Inspect", label: "Understand the source" },
    { value: "Treat", label: "Target the problem" },
    { value: "Prevent", label: "Reduce recurrence" },
  ] : [
    { value: "Focused", label: "Designed around the experience" },
    { value: "Thoughtful", label: "Details handled with care" },
    { value: "Clear", label: "Simple next steps" },
  ];
}

export function normalizeDesignSchema(input = {}) {
  const variant = PRESETS[input?.variant] ? input.variant : "editorial-luxury";
  const industry = clean(input?.industry, "generic");
  const requestedFamily = clean(input?.design_family, industry === "pest_control" ? "field-service" : "editorial-professional");
  const familySignal = [industry, requestedFamily, input?.business_model].map((value) => String(value || "").toLowerCase()).join(" ");
  const fieldService = /pest|extermin|plumb|hvac|clean|landscap|maintenance|repair|trade|field[- ]service|home[- ]service|local[- ]service/.test(familySignal);
  const designFamily = fieldService ? "field-service" : requestedFamily;
  const directions = Array.isArray(input?.design_directions) ? input.design_directions.slice(0, 3) : [];
  const selectedDirection = Math.max(0, Math.min(2, Number.isFinite(Number(input?.selected_direction)) ? Number(input.selected_direction) : 0));
  const direction = directions[selectedDirection] || {};
  return {
    industry,
    experience_kind: clean(input?.experience_kind, "marketing-site"),
    design_family: designFamily,
    business_model: clean(input?.business_model, fieldService ? "local-service" : "professional-service"),
    customer_type: clean(input?.customer_type, fieldService ? "local customers" : "business decision makers"),
    conversion_goal: clean(input?.conversion_goal, fieldService ? "book" : "contact"),
    urgency: clean(input?.urgency, fieldService ? "high" : "low"),
    trust_mode: clean(input?.trust_mode, fieldService ? "safety and local-proof" : "expertise and transparency"),
    visual_personality: Array.isArray(input?.visual_personality) ? input.visual_personality.slice(0, 5) : [],
    hero_layout: clean(direction?.hero_layout || input?.hero_layout, fieldService ? "full-bleed" : "offset-editorial"),
    section_rhythm: clean(direction?.section_rhythm || input?.section_rhythm, fieldService ? "story" : "asymmetric"),
    shape_language: clean(direction?.shape_language || input?.shape_language, fieldService ? "minimal" : "editorial"),
    typography_character: clean(direction?.typography_character || input?.typography_character, fieldService ? "humanist" : "editorial-serif"),
    color_direction: clean(direction?.color_direction || input?.color_direction, fieldService ? "forest-natural" : "warm-luxury"),
    imagery_strategy: clean(direction?.imagery_strategy || input?.imagery_strategy, fieldService ? "technician-in-context" : "people-and-place"),
    section_sequence: Array.isArray(direction?.section_sequence) ? direction.section_sequence.slice(0, 10) : Array.isArray(input?.section_sequence) ? input.section_sequence.slice(0, 10) : [],
    services_presentation: clean(direction?.services_presentation || input?.services_presentation, fieldService ? "timeline" : "editorial-list"),
    proof_presentation: clean(direction?.proof_presentation || input?.proof_presentation, fieldService ? "image-story" : "credential-led"),
    cta_presentation: clean(direction?.cta_presentation || input?.cta_presentation, fieldService ? "quiet-footer" : "quiet-footer"),
    nav_style: clean(direction?.nav_style || input?.nav_style, fieldService ? "local-service" : "minimal"),
    composition_shell: clean(direction?.composition_shell || input?.composition_shell, ""),
    navigation_mode: clean(direction?.navigation_mode || input?.navigation_mode, ""),
    information_density: clean(direction?.information_density || input?.information_density, ""),
    module_sequence: Array.isArray(direction?.module_sequence) ? direction.module_sequence.slice(0, 6) : Array.isArray(input?.module_sequence) ? input.module_sequence.slice(0, 6) : [],
    navigation_items: Array.isArray(direction?.navigation_items) ? direction.navigation_items.slice(0, 7) : Array.isArray(input?.navigation_items) ? input.navigation_items.slice(0, 7) : [],
    layout_graph: Array.isArray(direction?.layout_graph) ? direction.layout_graph.slice(0, 8) : Array.isArray(input?.layout_graph) ? input.layout_graph.slice(0, 8) : [],
    style_dna: direction?.style_dna && typeof direction.style_dna === "object" ? direction.style_dna : input?.style_dna && typeof input.style_dna === "object" ? input.style_dna : null,
    imagery_role: clean(direction?.imagery_role || input?.imagery_role, ""),
    interaction_pattern: clean(direction?.interaction_pattern || input?.interaction_pattern, ""),
    design_directions: directions,
    selected_direction: selectedDirection,
    variant,
    brand_name: clean(input?.brand_name, fieldService ? humanLabel(industry, "Local Service") : humanLabel(industry, "Professional Service")),
    eyebrow: safeClaim(input?.eyebrow, fieldService ? "Inspection · Treatment · Prevention" : humanLabel(industry, "Experience · Service · Detail")),
    headline: safeClaim(direction?.headline || input?.headline, fieldService ? "Protect the spaces you live and work in." : "An experience shaped around what matters."),
    subheadline: safeClaim(direction?.subheadline || input?.subheadline, fieldService ? "Assessment, targeted treatment and practical prevention from a professional local service team." : "A focused story, clear next steps and a page designed for this business."),
    primary_cta: safeClaim(direction?.primary_cta || input?.primary_cta, fieldService ? "Book an inspection" : "Explore"),
    secondary_cta: safeClaim(direction?.secondary_cta || input?.secondary_cta, fieldService ? "See our services" : "Learn more"),
    trust_line: safeClaim(input?.trust_line, fieldService ? "Clear advice, practical treatment plans and reliable follow-up." : "Clear information, relevant detail and a direct next step."),
    services_title: safeClaim(input?.services_title, fieldService ? "Solve the problem. Prevent the return." : "What the experience is built around."),
    services_intro: safeClaim(input?.services_intro, fieldService ? "A simple process built around inspection, the right treatment for the situation, and practical prevention." : "Three focused ways the page can communicate value without generic filler."),
    services: cards(input?.services, fieldService ? [
      { title: "Inspect", body: "Find the source and conditions driving the problem before treatment begins." },
      { title: "Treat", body: "Use a targeted plan suited to the property and level of activity." },
      { title: "Prevent", body: "Close the loop with practical steps that reduce recurrence." },
    ] : [
      { title: "Experience", body: "Show the primary value in a way that feels specific to the business." },
      { title: "Detail", body: "Use concrete information and visual evidence instead of generic marketing language." },
      { title: "Next step", body: "Make the intended action clear without forcing the same conversion pattern everywhere." },
    ]),
    proof_title: safeClaim(input?.proof_title, fieldService ? "A service experience built around clarity." : "Why this experience works."),
    proof_body: safeClaim(input?.proof_body, fieldService ? "Know what was found, what is being treated, what happens next and how to reduce recurrence." : "Use business-specific evidence, atmosphere and context instead of a fixed visual system."),
    stats: stats(input?.stats, fieldService),
    closing_title: safeClaim(input?.closing_title, fieldService ? "Need help with a pest problem?" : "Continue the story."),
    closing_body: safeClaim(input?.closing_body, fieldService ? "Start with an inspection and a clear plan for the property." : "End with a clear action that belongs to this concept and this business."),
  };
}

function Arrow() {
  return <span aria-hidden="true" className="text-[16px] leading-none">↗</span>;
}

function FieldServiceHero({
  schema,
  heroImageUrl,
  heroImageStatus,
  heroImageProgress,
  heroImageElapsedSeconds,
  green,
  acid,
  orange,
  ink,
  muted,
}) {
  const mode = schema.hero_layout || "full-bleed";
  const imageLayer = heroImageUrl
    ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${heroImageUrl}")` }}/>
    : heroImageStatus === "generating"
      ? <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#b9c8bf,#789183)]"><div className="absolute inset-0 animate-pulse bg-white/10 backdrop-blur-[12px]"/><div className="relative z-10 rounded-md bg-white/85 px-4 py-2 text-center shadow-lg"><div className="text-[10px] font-semibold" style={{ color: green }}>Generating service photography · ~{Math.max(8, Number(heroImageProgress || 8))}%</div><div className="mt-1 text-[8px]" style={{ color: muted }}>{Number(heroImageElapsedSeconds || 0)}s · Node01</div></div></div>
      : <div className="absolute inset-0 bg-[linear-gradient(135deg,#cfd9d3,#849a8e)]"/>;

  if (mode === "split") {
    return <section className="bg-white">
      <div className="mx-auto max-w-[1380px] px-6 pt-5 md:px-10 lg:px-12">
        <header className="flex items-center gap-4">
          <div className="text-[17px] font-extrabold tracking-[-0.03em]">{schema.brand_name}</div>
          <nav className="ml-auto hidden items-center gap-7 text-[10px] md:flex" style={{ color: muted }}><span>Problems</span><span>Process</span><span>Areas</span><span>About</span></nav>
          <button className="rounded-[6px] px-4 py-2.5 text-[10px] font-bold text-white" style={{ background: green }}>{schema.primary_cta}</button>
        </header>
        <div className="mt-8 grid min-h-[620px] overflow-hidden border lg:grid-cols-[.92fr_1.08fr]" style={{ borderColor: "#DDE3DF" }}>
          <div className="flex flex-col justify-center bg-[#F7F8F5] p-7 md:p-10 lg:p-14">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: green }}>{schema.eyebrow}</div>
            <h1 className="mt-5 text-[46px] font-black leading-[.92] tracking-[-0.055em] md:text-[62px] lg:text-[76px]">{schema.headline}</h1>
            <p className="mt-6 max-w-xl text-[16px] leading-7" style={{ color: muted }}>{schema.subheadline}</p>
            <div className="mt-7 flex gap-3"><button className="rounded-[6px] px-5 py-3 text-[11px] font-bold text-white" style={{ background: green }}>{schema.primary_cta}</button><button className="rounded-[6px] border px-5 py-3 text-[11px] font-semibold" style={{ borderColor: "#D9E0DB" }}>{schema.secondary_cta}</button></div>
            <div className="mt-10 grid grid-cols-3 gap-3">{["Inspect","Treat","Prevent"].map((x,i)=><div key={x} className="border-t pt-3" style={{borderColor:"#D9E0DB"}}><div className="text-[9px] font-bold" style={{color:orange}}>0{i+1}</div><div className="mt-1 text-[11px] font-semibold">{x}</div></div>)}</div>
          </div>
          <div className="relative min-h-[440px]">{imageLayer}<div className="absolute bottom-5 right-5 max-w-[240px] rounded-[8px] bg-white/92 p-4 shadow-xl backdrop-blur"><div className="text-[9px] font-bold uppercase tracking-[0.13em]" style={{color:green}}>Built for action</div><div className="mt-2 text-[12px] leading-5" style={{color:muted}}>{schema.trust_line}</div></div></div>
        </div>
      </div>
    </section>;
  }

  if (mode === "offset-editorial" || mode === "poster") {
    return <section className="relative overflow-hidden bg-[#ECE8DF]">
      <div className="mx-auto max-w-[1380px] px-6 pb-16 pt-5 md:px-10 lg:px-12">
        <header className="flex items-center gap-4">
          <div className="text-[17px] font-black tracking-[-0.04em]">{schema.brand_name}</div>
          <div className="ml-auto hidden text-[9px] font-semibold uppercase tracking-[0.16em] md:block" style={{color:muted}}>Local service · clear process</div>
          <button className="rounded-none border-2 px-4 py-2 text-[10px] font-black" style={{borderColor:ink}}>{schema.primary_cta}</button>
        </header>
        <div className="relative mt-10 min-h-[650px]">
          <div className="relative z-10 max-w-[850px]">
            <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: orange }}>{schema.eyebrow}</div>
            <h1 className="mt-4 text-[54px] font-black uppercase leading-[.84] tracking-[-0.07em] md:text-[80px] lg:text-[104px]">{schema.headline}</h1>
          </div>
          <div className="absolute bottom-0 right-0 h-[430px] w-[58%] min-w-[430px] overflow-hidden border-[10px] border-[#ECE8DF] bg-[#B8C5BE] shadow-2xl">{imageLayer}</div>
          <div className="absolute bottom-10 left-0 z-20 max-w-[360px] bg-[#18211E] p-5 text-white"><p className="text-[13px] leading-6 text-white/72">{schema.subheadline}</p><button className="mt-5 px-4 py-2.5 text-[10px] font-black" style={{background:acid,color:green}}>{schema.primary_cta}</button></div>
          <div className="absolute right-[55%] top-[52%] z-20 -rotate-90 text-[9px] font-black uppercase tracking-[0.18em]" style={{color:green}}>Inspect · Treat · Prevent</div>
        </div>
      </div>
    </section>;
  }

  return <section className="relative min-h-[720px] overflow-hidden bg-[#C9D5CD]">
    {imageLayer}
    <div className="absolute inset-0 bg-gradient-to-r from-[#10231c]/85 via-[#10231c]/44 to-transparent"/>
    <div className="relative z-10 mx-auto flex min-h-[720px] max-w-[1380px] flex-col px-6 pb-9 pt-5 md:px-10 lg:px-12">
      <header className="flex items-center gap-4 text-white">
        <div className="text-[17px] font-extrabold tracking-[-0.03em]">{schema.brand_name}</div>
        <nav className="ml-auto hidden items-center gap-7 text-[10px] text-white/75 md:flex"><span>Problems we solve</span><span>For homes</span><span>For business</span><span>About</span></nav>
        <button className="ml-4 rounded-[4px] px-4 py-2.5 text-[10px] font-bold" style={{ background: acid, color: green }}>{schema.primary_cta}</button>
      </header>
      <div className="my-auto max-w-[680px] pt-20 text-white">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">{schema.eyebrow}</div>
        <h1 className="mt-5 text-[48px] font-black leading-[.91] tracking-[-0.06em] md:text-[70px] lg:text-[86px]">{schema.headline}</h1>
        <p className="mt-6 max-w-[590px] text-[16px] leading-7 text-white/78 md:text-[18px]">{schema.subheadline}</p>
        <div className="mt-7 flex flex-wrap gap-3"><button className="rounded-[4px] px-5 py-3 text-[11px] font-bold" style={{ background: acid, color: green }}>{schema.primary_cta}</button><button className="rounded-[4px] border border-white/35 bg-white/10 px-5 py-3 text-[11px] font-semibold text-white backdrop-blur-sm">{schema.secondary_cta}</button></div>
      </div>
      <div className="grid gap-3 border-t border-white/25 pt-5 text-white md:grid-cols-[1.2fr_.8fr_.8fr_.8fr]"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/55">Common problems</div>{["Cockroaches","Termites","Rodents"].map((item)=><div key={item} className="text-[12px] font-semibold">{item}</div>)}</div>
    </div>
  </section>;
}

function FieldServicePreview({
  schema,
  heroImageUrl,
  supportImageUrl,
  heroImageStatus,
  supportImageStatus,
  heroImageProgress,
  supportImageProgress,
  heroImageElapsedSeconds,
  supportImageElapsedSeconds,
}) {
  const palette = paletteFor(schema);
  const green = palette.dark;
  const moss = palette.accent;
  const acid = palette.accentSoft;
  const orange = palette.accent;
  const ink = palette.ink;
  const muted = palette.muted;
  const line = palette.border;
  const mist = palette.bg;
  const conversionFirst = schema.section_rhythm === "conversion-led";
  const asymmetric = schema.section_rhythm === "asymmetric";
  const transparencyProof = schema.proof_presentation === "transparency-panel";
  const credentialProof = schema.proof_presentation === "credential-led";
  const boldCta = schema.cta_presentation === "bold-band";
  const stickyCta = schema.cta_presentation === "sticky-booking";

  return (
    <div className="min-h-[760px] overflow-hidden font-sans" style={{ color: ink, background: palette.bg }}>
      <FieldServiceHero
        schema={schema}
        heroImageUrl={heroImageUrl}
        heroImageStatus={heroImageStatus}
        heroImageProgress={heroImageProgress}
        heroImageElapsedSeconds={heroImageElapsedSeconds}
        green={green}
        acid={acid}
        orange={orange}
        ink={ink}
        muted={muted}
      />

      {conversionFirst ? (
        <section className="mx-auto max-w-[1380px] px-6 py-14 md:px-10 lg:px-12 lg:py-16">
          <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
            <div className="grid gap-4 md:grid-cols-3">
              {schema.services.slice(0,3).map((service,index)=><article key={service.title} className="min-h-[280px] border p-5" style={{ borderColor: line, background: index === 1 ? mist : "white" }}>
                <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: orange }}>Problem {index + 1}</div>
                <h3 className="mt-14 text-[28px] font-black leading-[1] tracking-[-0.04em]">{service.title}</h3>
                <p className="mt-4 text-[12px] leading-6" style={{ color: muted }}>{service.body}</p>
                <div className="mt-8 text-[11px] font-bold" style={{ color: green }}>See treatment path →</div>
              </article>)}
            </div>
            <aside className="flex min-h-[280px] flex-col justify-between p-6 text-white" style={{ background: green }}>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: acid }}>Need help now?</div>
                <h2 className="mt-4 text-[34px] font-black leading-[.98] tracking-[-0.04em]">{schema.closing_title}</h2>
                <p className="mt-4 text-[12px] leading-6 text-white/60">{schema.closing_body}</p>
              </div>
              <button className="mt-8 w-fit px-4 py-2.5 text-[10px] font-black" style={{ background: acid, color: green }}>{schema.primary_cta}</button>
            </aside>
          </div>
        </section>
      ) : asymmetric ? (
        <section className="mx-auto max-w-[1380px] px-6 py-16 md:px-10 lg:px-12 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: orange }}>Three moves, no clutter</div>
              <h2 className="mt-4 max-w-2xl text-[50px] font-black uppercase leading-[.88] tracking-[-0.06em]">{schema.services_title}</h2>
              <p className="mt-6 max-w-lg text-[13px] leading-6" style={{ color: muted }}>{schema.services_intro}</p>
            </div>
            <div className="space-y-8 pt-8">
              {schema.services.slice(0,3).map((service,index)=><div key={service.title} className={index === 1 ? "ml-10 border-l-4 pl-5" : "border-l-4 pl-5"} style={{ borderColor: index === 1 ? orange : green }}>
                <div className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: muted }}>0{index + 1}</div>
                <h3 className="mt-2 text-[26px] font-black tracking-[-0.04em]">{service.title}</h3>
                <p className="mt-2 max-w-md text-[12px] leading-6" style={{ color: muted }}>{service.body}</p>
              </div>)}
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-[1380px] px-6 py-14 md:px-10 lg:px-12 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[.78fr_1.22fr]">
            <div className="lg:sticky lg:top-8 lg:self-start">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: moss }}>What happens next</div>
              <h2 className="mt-4 max-w-md text-[38px] font-black leading-[.98] tracking-[-0.05em] md:text-[48px]">{schema.services_title}</h2>
              <p className="mt-5 max-w-md text-[13px] leading-6" style={{ color: muted }}>{schema.services_intro}</p>
            </div>
            <div className="border-t" style={{ borderColor: line }}>
              {schema.services.slice(0,3).map((service,index)=><div key={service.title} className="grid gap-4 border-b py-7 md:grid-cols-[80px_1fr_1fr] md:items-start" style={{ borderColor: line }}>
                <div className="text-[12px] font-black" style={{ color: orange }}>0{index+1}</div>
                <h3 className="text-[24px] font-extrabold tracking-[-0.035em]">{service.title}</h3>
                <p className="text-[12px] leading-6" style={{ color: muted }}>{service.body}</p>
              </div>)}
            </div>
          </div>
        </section>
      )}

      {transparencyProof ? (
        <section className="mx-auto max-w-[1380px] px-6 py-14 md:px-10 lg:px-12 lg:py-20">
          <div className="grid overflow-hidden border lg:grid-cols-[.75fr_1.25fr]" style={{ borderColor: line }}>
            <div className="p-7 md:p-10" style={{ background: mist }}>
              <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: orange }}>What you will know</div>
              <h2 className="mt-4 text-[38px] font-black leading-[.98] tracking-[-0.05em]">{schema.proof_title}</h2>
              <p className="mt-5 text-[13px] leading-6" style={{ color: muted }}>{schema.proof_body}</p>
            </div>
            <div className="grid md:grid-cols-3">
              {schema.stats.map((stat,index)=><div key={stat.label} className="flex min-h-[240px] flex-col justify-end border-l p-6 first:border-l-0" style={{ borderColor: line, background: index === 1 ? "#fff" : mist }}>
                <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: moss }}>0{index+1}</div>
                <div className="mt-auto pt-12 text-[24px] font-black tracking-[-0.04em]">{stat.value}</div>
                <div className="mt-2 text-[10px] leading-5" style={{ color: muted }}>{stat.label}</div>
              </div>)}
            </div>
          </div>
        </section>
      ) : credentialProof ? (
        <section className="relative overflow-hidden" style={{ background: "#EEE9DF", color: ink }}>
          <div className="mx-auto grid max-w-[1380px] lg:grid-cols-[.9fr_1.1fr]">
            <div className="relative min-h-[460px]">
              {supportImageUrl ? <div className="absolute inset-0 bg-cover bg-center grayscale" style={{ backgroundImage: `url("${supportImageUrl}")` }}/> : <div className="absolute inset-0 bg-[linear-gradient(145deg,#c7c0b3,#938d84)]"/>}
              <div className="absolute bottom-0 left-0 right-0 border-t border-black/20 bg-[#F0B35E] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em]">Inspection detail · evidence first</div>
            </div>
            <div className="flex flex-col justify-center p-8 md:p-12 lg:p-16">
              <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: orange }}>Why this approach</div>
              <h2 className="mt-4 max-w-xl text-[48px] font-black uppercase leading-[.9] tracking-[-0.06em]">{schema.proof_title}</h2>
              <p className="mt-6 max-w-xl text-[13px] leading-6" style={{ color: muted }}>{schema.proof_body}</p>
              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-black/15 pt-5">
                {schema.stats.map((stat)=><div key={stat.label}><div className="text-[12px] font-black">{stat.value}</div><div className="mt-1 text-[9px] leading-4" style={{ color: muted }}>{stat.label}</div></div>)}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden" style={{ background: green, color: 'white' }}>
          <div className="mx-auto grid max-w-[1380px] lg:grid-cols-[1.05fr_.95fr]">
            <div className="relative min-h-[420px]">
              {supportImageUrl ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${supportImageUrl}")` }}/> : null}
              {!supportImageUrl && supportImageStatus === "generating" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#8da095,#4c655a)]">
                  <div className="absolute inset-0 animate-pulse bg-white/10 backdrop-blur-[10px]"/>
                  <div className="relative z-10 rounded-md bg-white/85 px-4 py-2 text-center">
                    <div className="text-[9px] font-semibold" style={{ color: green }}>Generating inspection detail · ~{Math.max(8, Number(supportImageProgress || 8))}%</div>
                    <div className="mt-1 text-[8px]" style={{ color: muted }}>{Number(supportImageElapsedSeconds || 0)}s · Node01</div>
                  </div>
                </div>
              ) : null}
              {!supportImageUrl && supportImageStatus !== "generating" ? <div className="absolute inset-0 bg-[linear-gradient(145deg,#9cad9f,#566e62)]"/> : null}
            </div>
            <div className="flex flex-col justify-center p-8 md:p-12 lg:p-16">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: acid }}>Inspection first</div>
              <h2 className="mt-4 text-[40px] font-black leading-[.96] tracking-[-0.05em] md:text-[54px]">{schema.proof_title}</h2>
              <p className="mt-6 max-w-xl text-[13px] leading-6 text-white/65">{schema.proof_body}</p>
              <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/20 pt-5">
                {schema.stats.map((stat)=><div key={stat.label}><div className="text-[13px] font-extrabold">{stat.value}</div><div className="mt-1 text-[9px] leading-4 text-white/45">{stat.label}</div></div>)}
              </div>
            </div>
          </div>
        </section>
      )}

      {boldCta ? (
        <section className="border-y border-black/15 px-6 py-14 md:px-10 lg:px-12" style={{ background: "#F0B35E", color: "#1F1F1B" }}>
          <div className="mx-auto flex max-w-[1380px] flex-col gap-8 md:flex-row md:items-end">
            <h2 className="max-w-4xl text-[50px] font-black uppercase leading-[.86] tracking-[-0.065em] md:text-[72px]">{schema.closing_title}</h2>
            <div className="md:ml-auto md:max-w-sm">
              <p className="text-[13px] leading-6">{schema.closing_body}</p>
              <button className="mt-5 border-2 border-black bg-transparent px-5 py-3 text-[11px] font-black uppercase">{schema.primary_cta}</button>
            </div>
          </div>
        </section>
      ) : stickyCta ? (
        <section className="mx-auto max-w-[1380px] px-6 py-14 md:px-10 lg:px-12">
          <div className="grid gap-6 border p-6 lg:grid-cols-[1fr_auto] lg:items-center" style={{ borderColor: line, background: "#fff" }}>
            <div><div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: orange }}>Ready when you are</div><h2 className="mt-2 text-[34px] font-black tracking-[-0.045em]">{schema.closing_title}</h2><p className="mt-2 text-[12px]" style={{ color: muted }}>{schema.closing_body}</p></div>
            <div className="flex gap-3"><button className="px-5 py-3 text-[11px] font-black text-white" style={{ background: green }}>{schema.primary_cta}</button><button className="border px-5 py-3 text-[11px] font-semibold" style={{ borderColor: line }}>Call instead</button></div>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-[1380px] px-6 py-16 md:px-10 lg:px-12 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[1fr_.72fr] lg:items-end">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: orange }}>Local help, clear next step</div>
              <h2 className="mt-4 max-w-4xl text-[42px] font-black leading-[.95] tracking-[-0.055em] md:text-[60px]">{schema.closing_title}</h2>
            </div>
            <div>
              <p className="text-[13px] leading-6" style={{ color: muted }}>{schema.closing_body}</p>
              <button className="mt-6 rounded-[4px] px-5 py-3 text-[11px] font-bold text-white" style={{ background: orange }}>{schema.primary_cta}</button>
            </div>
          </div>
        </section>
      )}
      <footer className="mx-auto flex max-w-[1380px] flex-wrap items-center gap-3 border-t px-6 py-6 text-[9px] md:px-10 lg:px-12" style={{ borderColor: line, color: muted }}>
        <span className="font-bold" style={{ color: ink }}>{schema.brand_name}</span>
        <span>Residential · Commercial · Prevention</span>
        <span className="ml-auto">Inspection first. Treatment second. Prevention always.</span>
      </footer>
    </div>
  );
}

function CompactDesignPreview({ schema, rawSchema, heroImageUrl, heroImageStatus, heroImageProgress }) {
  const conceptSignal = String(rawSchema?.concept_name || "").toLowerCase();
  const explicitKind = /dark|cinematic|night|midnight|noir/.test(conceptSignal)
    ? "cinematic"
    : /bright|graphic|sun|yellow|grid/.test(conceptSignal)
      ? "graphic"
      : /tactile|paper|fold|journal|print|ink/.test(conceptSignal)
        ? "tactile"
        : null;
  const heroLayout = String(schema.hero_layout || "").toLowerCase();
  const kind = explicitKind
    || (heroLayout === "full-bleed" ? "cinematic"
      : heroLayout === "offset-editorial" ? "tactile"
        : heroLayout === "split" ? "graphic"
          : "graphic");
  const nav = navLabelsFor(schema).slice(0, 4);
  const contact = contactLabelFor(schema);
  const industrySignal = [
    schema.industry,
    schema.brand_name,
    schema.headline,
    schema.subheadline,
    schema.services_title,
    schema.interaction_pattern,
    ...(Array.isArray(schema.module_sequence) ? schema.module_sequence : []),
    ...(Array.isArray(schema.navigation_items) ? schema.navigation_items : []),
    ...(Array.isArray(schema.layout_graph) ? schema.layout_graph.flatMap((node) => [node?.type, node?.label]) : []),
    ...schema.services.map((service) => service?.title),
  ].join(" ").toLowerCase();
  const healthcare = /health|hospital|patient|clinic|medical|care\b/.test(industrySignal);
  const finance = /finance|account|ledger|reconcil|invoice|bank|cash|payable|receivable|audit|close|journal/.test(industrySignal);
  const labels = healthcare
    ? {
        cinematicKicker: "Care experience",
        cinematicMeta: "PATIENT / CARE / ACCESS",
        graphicKicker: "Patient path system",
        graphicBadge: "CARE 02",
        tactileHeader: "Care journal · issue 03",
        tactileBadge: "CARE STUDY 03",
        tactileKicker: "Clinical story / human care",
        tactileNext: "Next care layer",
      }
    : {
        cinematicKicker: "Cinematic field notes",
        cinematicMeta: "EARTH / HUMAN / LIGHT",
        graphicKicker: "Sunlit route system",
        graphicBadge: "ROUTE 02",
        tactileHeader: "Field journal · issue 03",
        tactileBadge: "PLATE 03 / TRAVEL STUDY",
        tactileKicker: "Printed travel journal",
        tactileNext: "Next spread",
      };
  const status = heroImageStatus === "generating" || heroImageStatus === "reviewing" || heroImageStatus === "repairing"
    ? `rendering ${Math.max(8, Number(heroImageProgress || 8))}%`
    : heroImageStatus === "needs-review" ? "image rejected" : null;
  const hero = (overlay = "linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.38))") => heroImageUrl
    ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `${overlay},url("${heroImageUrl}")` }}/>
    : <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,.16),transparent_26%),linear-gradient(135deg,#47433e,#181818)]"/>;
  const experienceKind = String(schema.experience_kind || rawSchema?.experience_kind || "marketing-site").toLowerCase();
  const systemLike = experienceKind === "product-system";
  const portalLike = experienceKind === "portal";
  const transactionLike = experienceKind === "transaction-flow";
  const operationalLike = systemLike || portalLike || transactionLike;
  const blueprintModules = Array.isArray(schema.module_sequence) && schema.module_sequence.length
    ? schema.module_sequence.slice(0, 6)
    : systemLike
      ? ["Current state", "Work queue", "Activity", "Attention"]
      : portalLike
        ? ["Today", "Records", "Messages", "Next steps"]
        : ["Current step", "Choices", "Review", "Completion"];
  const layoutGraph = Array.isArray(schema.layout_graph) ? schema.layout_graph.slice(0, 8) : [];
  const density = ["dense", "balanced", "airy"].includes(schema.information_density) ? schema.information_density : "balanced";

  if (operationalLike) {
    const shell = ["sidebar", "rail", "topbar", "split-pane", "canvas"].includes(schema.composition_shell)
      ? schema.composition_shell
      : heroLayout === "flow-canvas"
        ? "canvas"
        : heroLayout === "command-center"
          ? "rail"
          : "sidebar";
    const palette = paletteFor(schema);
    const isDarkHex = (value) => {
      const hex = String(value || "").replace("#", "");
      if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
      const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
      return ((r * 299) + (g * 587) + (b * 114)) / 1000 < 135;
    };
    const dark = isDarkHex(palette.bg);
    const theme = { bg: palette.bg, panel: palette.surface, panel2: palette.accentSoft, ink: palette.ink, muted: palette.muted, line: palette.border, accent: palette.accent, accent2: palette.muted };
    const dna = schema.style_dna || {};
    const spacing = dna.spacing || density;
    const pad = spacing === "compact" || density === "dense" ? "p-2" : spacing === "spacious" || density === "airy" ? "p-4" : "p-3";
    const radius = dna.radius === "square" ? "2px" : dna.radius === "pill" ? "20px" : dna.radius === "soft" ? "14px" : "8px";
    const surfaceShadow = dna.surface === "layered" ? "0 10px 24px rgba(0,0,0,.08)" : dna.surface === "glass" ? "0 8px 26px rgba(0,0,0,.10)" : "none";
    const fontFamily = dna.typography === "serif" ? "Georgia, 'Times New Roman', serif" : dna.typography === "mono" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : dna.typography === "condensed" ? "'Arial Narrow', Arial, sans-serif" : "Inter, ui-sans-serif, system-ui, sans-serif";
    const surfaceBackground = dna.surface === "outlined" ? "transparent" : theme.panel;
    const cardStyle = { background: surfaceBackground, borderColor: theme.line, borderRadius: radius, boxShadow: surfaceShadow, backdropFilter: dna.surface === "glass" ? "blur(14px)" : undefined };
    const navItems = Array.isArray(schema.navigation_items) && schema.navigation_items.length >= 4
      ? schema.navigation_items.slice(0, 7)
      : ["Overview", ...blueprintModules.slice(0, 4).map((value) => String(value || "").split(/\s+/).slice(0, 2).join(" ")), "Activity"].slice(0, 6);
    const financeMetric = (label, index) => {
      const lower = String(label || "").toLowerCase();
      if (/cash|balance|liquid/.test(lower)) return { value: "4.82M", delta: "+6.8%", note: "Available" };
      if (/receiv|revenue|inflow/.test(lower)) return { value: "812K", delta: "+4.1%", note: "This period" };
      if (/payable|outflow|expense/.test(lower)) return { value: "633K", delta: "-2.4%", note: "Committed" };
      if (/risk|exception/.test(lower)) return { value: "18", delta: "3 urgent", note: "Open items" };
      if (/close|ready|status/.test(lower)) return { value: "92%", delta: "+8 pts", note: "Close ready" };
      return { value: ["1.84M","72%","18","Ready"][index % 4], delta: ["+5.2%","+3 pts","2 urgent","On track"][index % 4], note: "Current period" };
    };
    const financeRows = (label) => {
      const lower = String(label || "").toLowerCase();
      if (/reconcil|bank/.test(lower)) return [["Operating account","Matched","Today"],["Card settlements","Review","Today"],["Clearing account","Open","Recent"]];
      if (/invoice|receiv/.test(lower)) return [["Customer invoices","Ready","Today"],["Overdue items","Review","Today"],["Unapplied cash","Open","Recent"]];
      if (/ledger|journal|account/.test(lower)) return [["Revenue posting","Ready","Now"],["Expense accrual","Review","Today"],["Adjustment entry","Open","Recent"]];
      return [["Current item","Ready","Now"],["Review item","Review","Today"],["Open item","Open","Recent"]];
    };
    const renderModule = (label, index, extra = "", forcedType = "") => {
      const exactType = String(forcedType || "").toLowerCase();
      const lower = `${exactType} ${String(label || "").toLowerCase()}`;
      const tableLike = exactType ? ["table","records"].includes(exactType) : /ledger|account|journal|transaction|invoice|reconcil/.test(lower);
      const metricLike = !exactType && /cash|revenue|receiv|payable|balance|position|forecast/.test(lower);
      const queueLike = !exactType && /attention|approval|review|exception|task/.test(lower);
      const progressLike = !exactType && /close|progress|period|post|validate/.test(lower);
      if (exactType === "metric") {
        const metric = finance ? financeMetric(label, index) : { value:["Live","72%","18","Ready"][index%4], delta:"↗ active", note:"Current state" };
        return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex items-center text-[5px] uppercase tracking-[.1em]" style={{color:theme.muted}}><span>{label}</span><span className="ml-auto normal-case tracking-normal">{metric.note}</span></div><div className="mt-1 flex items-end"><div className="text-[18px] font-semibold tracking-[-.05em]">{metric.value}</div><span className="ml-2 mb-0.5 text-[5px]" style={{color:theme.accent}}>{metric.delta}</span></div><div className="mt-2 flex h-8 items-end gap-[2px]">{[22,37,29,51,42,68,58,79,71,88].map((h,i)=><span key={i} className="flex-1 rounded-t-[1px]" style={{height:`${h}%`,background:i>6?theme.accent:theme.accent2,opacity:.78}}/>)}</div></div>;
      }
      if (exactType === "chart") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex"><div className="text-[6px] font-semibold">{label}</div><span className="ml-auto text-[5px]" style={{color:theme.muted}}>{finance ? "Actual · Forecast" : "Live trend"}</span></div>{finance?<div className="mt-1 flex gap-3 text-[5px]" style={{color:theme.muted}}><span><b style={{color:theme.ink}}>1.84M</b> actual</span><span><b style={{color:theme.accent}}>2.06M</b> forecast</span></div>:null}<div className="relative mt-2 h-16 overflow-hidden"><div className="absolute inset-0 opacity-40" style={{backgroundImage:`linear-gradient(${theme.line} 1px,transparent 1px)`,backgroundSize:"100% 16px"}}/><svg viewBox="0 0 100 40" preserveAspectRatio="none" className="relative h-full w-full"><path d="M0 32 C10 30 14 18 25 23 S42 35 50 20 S68 8 75 16 S90 27 100 7" fill="none" stroke={theme.accent} strokeWidth="2" vectorEffect="non-scaling-stroke"/><path d="M0 38 C18 34 27 30 38 32 S59 26 70 28 S88 20 100 22" fill="none" stroke={theme.accent2} strokeWidth="1" opacity=".55" vectorEffect="non-scaling-stroke"/></svg></div></div>;
      if (exactType === "messages") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex"><div className="text-[6px] font-semibold">{label}</div><span className="ml-auto text-[5px]" style={{color:theme.muted}}>3 active</span></div><div className="mt-2 space-y-1.5">{["Update received","Needs review","Assigned to team"].map((msg,i)=><div key={msg} className={`flex ${i===1?"justify-end":"justify-start"}`}><div className="max-w-[82%] px-2 py-1.5 text-[5px]" style={{background:i===1?theme.accent:theme.panel2,color:i===1?(dark?"#061217":"#fff"):theme.ink,borderRadius:radius}}>{msg}</div></div>)}</div></div>;
      if (exactType === "timeline") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="relative mt-2 pl-3"><div className="absolute bottom-1 left-[3px] top-1 w-px" style={{background:theme.line}}/>{["Now","Next","Later"].map((item,i)=><div key={item} className="relative mb-2 flex text-[5px]"><span className="absolute -left-[12px] top-[2px] h-2 w-2 rounded-full border" style={{background:i===0?theme.accent:theme.panel,borderColor:i===0?theme.accent:theme.line}}/><span>{item}</span><span className="ml-auto" style={{color:theme.muted}}>{blueprintModules[i] || ""}</span></div>)}</div></div>;
      if (exactType === "status") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex text-[6px] font-semibold"><span>{label}</span>{finance?<span className="ml-auto text-[5px] font-normal" style={{color:theme.muted}}>Period status</span>:null}</div><div className="mt-3 flex items-center gap-3"><div className="relative h-14 w-14 rounded-full" style={{background:`conic-gradient(${theme.accent} 0 ${finance?92:72}%,${theme.panel2} ${finance?92:72}% 100%)`}}><div className="absolute inset-[6px] flex items-center justify-center rounded-full text-[8px] font-semibold" style={{background:theme.panel}}>{finance?"92%":"72%"}</div></div><div className="space-y-1 text-[5px]"><div>{finance?"Ready to close":"Ready"}</div><div style={{color:theme.muted}}>{finance?"3 items to review":"Review pending"}</div><div style={{color:theme.muted}}>{finance?"1 approval blocked":"Next action"}</div></div></div></div>;
      if (exactType === "workflow") {
        const stages = finance ? ["Capture","Match","Approve","Post"] : ["Capture","Review","Act","Verify"];
        return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex text-[6px] font-semibold"><span>{label}</span>{finance?<span className="ml-auto text-[5px] font-normal" style={{color:theme.muted}}>2 of 4 complete</span>:null}</div><div className="mt-3 flex items-center">{stages.map((item,i)=><div key={item} className="flex min-w-0 flex-1 items-center"><div className="min-w-0"><div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[5px] font-semibold" style={{background:i<2?theme.accent:theme.panel2,color:i<2?(dark?"#061217":"#fff"):theme.muted}}>{i<2?"✓":i+1}</div><div className="mt-1 truncate text-center text-[4.5px]" style={{color:theme.muted}}>{item}</div></div>{i<3?<div className="mb-3 h-px flex-1" style={{background:i<1?theme.accent:theme.line}}/>:null}</div>)}</div></div>;
      }
      if (tableLike) {
        const semanticRows = finance ? financeRows(label) : null;
        const records = blueprintModules.filter((item) => String(item || "").toLowerCase() !== String(label || "").toLowerCase()).slice(0, 3);
        while (records.length < 3) records.push(["Recent record","Open item","Current state"][records.length]);
        return <div key={label + index} className={`rounded-lg border ${extra}`} style={cardStyle}>
          <div className="flex items-center px-2.5 py-2 text-[6px] font-semibold"><span>{label}</span><span className="ml-auto" style={{ color: theme.muted }}>Open</span></div>
          <div className="grid grid-cols-[1.25fr_.75fr_.65fr] border-t px-2.5 py-1.5 text-[5px] uppercase tracking-[.08em]" style={{ borderColor: theme.line, color: theme.muted }}><span>Item</span><span>State</span><span>Updated</span></div>
          {(semanticRows || records.map((record,rowIndex)=>[record,["Ready","Review","Open"][rowIndex],["Now","Today","Recent"][rowIndex]])).map((row,rowIndex)=><div key={`${row[0]}-${rowIndex}`} className="grid grid-cols-[1.25fr_.75fr_.65fr] border-t px-2.5 py-1.5 text-[6px]" style={{ borderColor: theme.line }}><span className="truncate">{row[0]}</span><span style={{color:row[1]==="Review"?theme.accent2:theme.accent}}>{row[1]}</span><span style={{color:theme.muted}}>{row[2]}</span></div>)}
        </div>;
      }
      if (metricLike) return <div key={label + index} className={`rounded-lg border ${extra}`} style={cardStyle}>
        <div className="px-2 pt-2 text-[5px]" style={{ color: theme.muted }}>{label}</div>
        <div className="px-2 text-[13px] font-semibold tracking-[-.035em]">{["Live","Open","Ready","Review"][index % 4]}</div>
        <div className="mt-2 flex h-10 items-end gap-1 px-2 pb-2">{[28,44,38,57,49,68,62,80].map((h,i)=><div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i > 5 ? theme.accent : theme.accent2, opacity: .72 }}/>)}</div>
      </div>;
      if (queueLike) {
        const queueItems = layoutGraph.filter((node) => node?.label && node.label !== label).slice(0,3).map((node)=>node.label);
        return <div key={label + index} className={`rounded-lg border ${extra}`} style={cardStyle}>
          <div className="px-2.5 py-2 text-[6px] font-semibold">{label}</div>
          <div className="space-y-1 px-2.5 pb-2">{queueItems.map((item,i)=><div key={item} className="flex items-center gap-1.5 px-1.5 py-1.5" style={{ background: theme.panel2, borderRadius: radius }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: i === 0 ? theme.accent : theme.accent2 }}/><span className="truncate text-[5.5px]">{item}</span><span className="ml-auto text-[5px]" style={{ color: theme.muted }}>{["Now","Next","Open"][i]}</span></div>)}</div>
        </div>;
      }
      if (progressLike) return <div key={label + index} className={`rounded-lg border ${extra}`} style={cardStyle}>
        <div className="px-2.5 py-2 text-[6px] font-semibold">{label}</div>
        <div className="space-y-2 px-2.5 pb-2">{[["Ready",82],["In review",61],["Next",44]].map(([name,val])=><div key={name}><div className="flex text-[5px]"><span>{name}</span><span className="ml-auto" style={{ color: theme.muted }}>{val}%</span></div><div className="mt-1 h-1 rounded-full" style={{ background: theme.panel2 }}><div className="h-1 rounded-full" style={{ width: `${val}%`, background: theme.accent }}/></div></div>)}</div>
      </div>;
      if (exactType === "form") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="mt-2 grid grid-cols-2 gap-1.5">{["Type","Owner","Reference","Date"].map((field)=><div key={field} className="border px-1.5 py-1.5 text-[5px]" style={{borderColor:theme.line,borderRadius:Math.max(2,parseInt(radius,10)/2),color:theme.muted}}>{field}</div>)}</div><div className="mt-2 inline-flex px-2 py-1 text-[5px] font-semibold" style={{background:theme.accent,color:dark?"#061217":"#fff",borderRadius:radius}}>Continue</div></div>;
      if (exactType === "filter" || exactType === "search") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="mt-2 flex gap-1.5">{["Current","Open","Recent"].map((item,i)=><span key={item} className="border px-2 py-1 text-[5px]" style={{borderColor:theme.line,background:i===0?theme.accent:theme.panel2,color:i===0?(dark?"#061217":"#fff"):theme.muted,borderRadius:radius}}>{item}</span>)}</div></div>;
      if (exactType === "action") return <div key={label + index} className={`border ${extra} p-2.5`} style={{...cardStyle,background:theme.accent,color:dark?"#061217":"#fff"}}><div className="text-[5px] uppercase tracking-[.12em] opacity-65">Action</div><div className="mt-1 text-[10px] font-semibold leading-tight">{label}</div><div className="mt-4 text-[6px] font-semibold">Open →</div></div>;
      if (exactType === "document") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex items-center"><div className="text-[6px] font-semibold">{label}</div><span className="ml-auto text-[5px]" style={{color:theme.muted}}>Evidence</span></div><div className="mt-3 space-y-1.5">{["Current file","Recent update","Related record"].map((item,i)=><div key={item} className="flex border-b pb-1 text-[5px]" style={{borderColor:theme.line}}><span>{item}</span><span className="ml-auto" style={{color:theme.muted}}>0{i+1}</span></div>)}</div></div>;
      if (exactType === "activity") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="mt-2 space-y-2">{["Updated","Reviewed","Assigned"].map((item,i)=><div key={item} className="flex items-center gap-2 text-[5px]"><span className="h-1.5 w-1.5 rounded-full" style={{background:i===0?theme.accent:theme.accent2}}/><span>{item}</span><span className="ml-auto" style={{color:theme.muted}}>{["now","today","recent"][i]}</span></div>)}</div></div>;
      if (exactType === "image") return <div key={label + index} className={`relative overflow-hidden border ${extra}`} style={cardStyle}><div className="absolute inset-0 opacity-25" style={{background:`radial-gradient(circle at 72% 28%,${theme.accent},transparent 28%),linear-gradient(145deg,${theme.panel2},${theme.bg})`}}/><div className="relative p-2.5"><div className="text-[5px] uppercase tracking-[.12em]" style={{color:theme.muted}}>Visual context</div><div className="mt-1 text-[8px] font-semibold">{label}</div></div></div>;
      if (exactType === "kanban") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="mb-2 flex items-center"><div className="text-[6px] font-semibold">{label}</div><span className="ml-auto text-[5px]" style={{color:theme.muted}}>Board</span></div><div className="grid grid-cols-3 gap-1.5">{["Now","Next","Done"].map((col,c)=><div key={col}><div className="mb-1 text-[5px]" style={{color:theme.muted}}>{col}</div>{[0,1].map((i)=><div key={i} className="mb-1.5 border px-1.5 py-1.5 text-[5px]" style={{borderColor:theme.line,background:theme.panel2,borderRadius:radius}}>{blueprintModules[(c+i)%blueprintModules.length] || label}</div>)}</div>)}</div></div>;
      if (exactType === "gantt") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="mt-2 space-y-2">{blueprintModules.slice(0,4).map((item,i)=><div key={item} className="grid grid-cols-[72px_1fr] items-center gap-2"><span className="truncate text-[5px]" style={{color:theme.muted}}>{item}</span><div className="h-2 rounded-full" style={{background:theme.panel2}}><div className="h-2 rounded-full" style={{width:`${[74,48,62,35][i]}%`,background:i%2?theme.accent2:theme.accent}}/></div></div>)}</div></div>;
      if (exactType === "calendar" || exactType === "scheduler") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex items-center"><div className="text-[6px] font-semibold">{label}</div><span className="ml-auto text-[5px]" style={{color:theme.muted}}>Week</span></div><div className="mt-2 grid grid-cols-5 gap-1">{["M","T","W","T","F"].map((day,i)=><div key={day+i} className="text-center"><div className="text-[4.5px]" style={{color:theme.muted}}>{day}</div><div className="mt-1 h-12 border p-1" style={{borderColor:theme.line,borderRadius:Math.max(2,parseInt(radius,10)/2)}}><div className="h-2 rounded-sm" style={{background:i===2?theme.accent:theme.panel2}}/><div className="mt-1 h-2 rounded-sm" style={{background:i===4?theme.accent2:theme.panel2}}/></div></div>)}</div></div>;
      if (exactType === "map" || exactType === "floorplan") return <div key={label + index} className={`relative overflow-hidden border ${extra}`} style={cardStyle}><div className="absolute inset-0 opacity-50" style={{backgroundImage:`linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px)`,backgroundSize:"18px 18px"}}/><div className="relative p-2.5"><div className="text-[6px] font-semibold">{label}</div><div className="relative mt-3 h-16">{[[18,20],[62,15],[42,55],[78,62]].map(([x,y],i)=><span key={i} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{left:`${x}%`,top:`${y}%`,borderColor:theme.surface,background:i===0?theme.accent:theme.accent2}}/>)}</div></div></div>;
      if (exactType === "matrix") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="mt-2 grid grid-cols-5 gap-1">{Array.from({length:20}).map((_,i)=><div key={i} className="aspect-square" style={{background:i%7===0?theme.accent:i%3===0?theme.accent2:theme.panel2,borderRadius:Math.max(2,parseInt(radius,10)/3),opacity:.35+(i%5)*.12}}/>)}</div></div>;
      if (exactType === "editor") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="flex items-center"><div className="text-[6px] font-semibold">{label}</div><span className="ml-auto text-[5px]" style={{color:theme.muted}}>Draft</span></div><div className="mt-2 space-y-1.5">{[78,92,66,84].map((w,i)=><div key={i} className="h-1.5 rounded-full" style={{width:`${w}%`,background:i===0?theme.accent:theme.panel2}}/>)}</div><div className="mt-3 border-t pt-2 text-[5px]" style={{borderColor:theme.line,color:theme.muted}}>Structured content · contextual actions</div></div>;
      if (exactType === "inbox") return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[6px] font-semibold">{label}</div><div className="mt-2 space-y-1">{["Priority","Assigned","Recent"].map((item,i)=><div key={item} className="flex items-center gap-2 border-b py-1.5 text-[5px]" style={{borderColor:theme.line}}><span className="h-1.5 w-1.5 rounded-full" style={{background:i===0?theme.accent:theme.accent2}}/><span>{item}</span><span className="ml-auto" style={{color:theme.muted}}>{[3,7,12][i]}</span></div>)}</div></div>;
      if (exactType === "command") return <div key={label + index} className={`border ${extra} p-2.5`} style={{...cardStyle,background:dark?"rgba(0,0,0,.18)":theme.panel}}><div className="text-[5px] uppercase tracking-[.12em]" style={{color:theme.muted}}>Command</div><div className="mt-2 flex items-center border px-2 py-2 text-[6px]" style={{borderColor:theme.line,borderRadius:radius}}><span style={{color:theme.accent}}>⌘</span><span className="ml-2">{label}</span><span className="ml-auto" style={{color:theme.muted}}>Enter</span></div><div className="mt-2 flex flex-wrap gap-1">{blueprintModules.slice(0,3).map((item)=><span key={item} className="px-1.5 py-1 text-[5px]" style={{background:theme.panel2,borderRadius:radius}}>{item}</span>)}</div></div>;
      return <div key={label + index} className={`border ${extra} p-2.5`} style={cardStyle}><div className="text-[5px]" style={{ color: theme.muted }}>0{index+1}</div><div className="mt-1 text-[8px] font-semibold">{label}</div><div className="mt-2 text-[5.5px] leading-relaxed" style={{ color: theme.muted }}>{exactType === "summary" ? "Current state, signals and next action in one view." : schema.subheadline}</div></div>;
    };
    const top = <div className="flex h-10 items-center border-b px-3" style={{ borderColor: theme.line, background: theme.panel }}><div className="text-[8px] font-bold">{schema.brand_name}</div>{finance?<div className="ml-3 flex items-center gap-2 text-[5px]" style={{color:theme.muted}}><span>Entity · All</span><span>Period · Current</span><span className="h-1.5 w-1.5 rounded-full" style={{background:theme.accent}}/><span>Live</span></div>:<div className="ml-4 rounded-md px-3 py-1 text-[5px]" style={{ background: theme.panel2, color: theme.muted }}>Search workspace…</div>}<div className="ml-auto rounded-md px-2 py-1 text-[5px] font-semibold" style={{ background: theme.accent, color: dark ? "#061217" : "#fff" }}>{schema.primary_cta || "New action"}</div></div>;
    const heading = <div className="flex items-end"><div><div className="text-[5px] uppercase tracking-[.15em]" style={{ color: theme.accent }}>{schema.interaction_pattern || "Operational workspace"}</div><div className="mt-1 max-w-[280px] text-[17px] font-semibold leading-[1.02] tracking-[-.04em]">{schema.headline}</div></div><div className="ml-auto text-[5px]" style={{ color: theme.muted }}>{schema.navigation_mode || "workspace"} · {density}</div></div>;
    if (layoutGraph.length >= 5) {
      const graphCards = layoutGraph.map((node,index)=>{
        const span=Math.max(1,Math.min(4,Number(node?.span)||1));
        const minHeight=node?.height==="tall"?"118px":node?.height==="short"?"58px":"84px";
        const opacity=node?.emphasis==="quiet"?.82:1;
        return <div key={node?.id || `${node?.type}-${index}`} style={{gridColumn:`span ${span} / span ${span}`,minHeight,opacity}}>{renderModule(node?.label || `Region ${index+1}`,index,"h-full",node?.type || "summary")}</div>;
      });
      const graphBody = <main className={pad}>{heading}<div className="mt-3 grid grid-cols-4 auto-rows-min gap-2">{graphCards}</div></main>;
      if (shell === "rail") return <div className="h-[360px] overflow-hidden" style={{background:theme.bg,color:theme.ink,fontFamily}}><div className="grid h-full grid-cols-[54px_1fr]"><aside className="flex flex-col border-r p-2" style={{borderColor:theme.line,background:dark?theme.panel:theme.ink,color:dark?theme.ink:theme.bg}}><div className="mb-4 flex h-7 w-7 items-center justify-center rounded-md text-[7px] font-black" style={{background:theme.accent,color:dark?"#061217":"#fff"}}>{String(schema.brand_name||"F").slice(0,1)}</div>{navItems.slice(0,6).map((x,i)=><div key={x} className="mb-1 flex h-7 items-center justify-center rounded-md text-[5px]" style={{background:i===1?theme.accent:"transparent",color:i===1?(dark?"#061217":"#fff"):dark?theme.muted:theme.bg}}>{x.slice(0,1)}</div>)}<div className="mt-auto text-center text-[5px]" style={{color:dark?theme.muted:theme.bg}}>LIVE</div></aside><div>{top}{graphBody}</div></div></div>;
      if (shell === "sidebar") return <div className="h-[360px] overflow-hidden" style={{background:theme.bg,color:theme.ink,fontFamily}}><div className="grid h-full grid-cols-[118px_1fr]"><aside className="border-r p-3" style={{borderColor:theme.line,background:theme.panel}}><div className="text-[8px] font-bold">{schema.brand_name}</div><div className="mt-1 text-[5px]" style={{color:theme.muted}}>{finance?"Financial control":"Workspace"}</div><div className="mt-4">{navItems.slice(0,6).map((x,i)=><div key={x} className="mb-1.5 rounded-md px-2 py-2 text-[5.5px]" style={{background:i===1?theme.panel2:"transparent",color:i===1?theme.ink:theme.muted,borderLeft:i===1?`2px solid ${theme.accent}`:"2px solid transparent"}}>{x}</div>)}</div><div className="mt-4 border-t pt-3 text-[5px]" style={{borderColor:theme.line,color:theme.muted}}>Entity · Period · Evidence</div></aside><div>{top}{graphBody}</div></div></div>;
      if (shell === "split-pane") return <div className="h-[360px] overflow-hidden" style={{background:theme.bg,color:theme.ink,fontFamily}}>{top}<div className="grid h-[320px] grid-cols-[1fr_205px]"><main className={pad}>{heading}<div className="mt-3 grid grid-cols-3 gap-2">{layoutGraph.slice(0,4).map((node,index)=><div key={node.id || node.label} className={index===0?"col-span-2":"col-span-1"}>{renderModule(node.label,index,"h-full",node.type)}</div>)}</div></main><aside className="border-l p-3" style={{borderColor:theme.line,background:theme.panel2}}><div className="text-[5px] uppercase tracking-[.14em]" style={{color:theme.accent}}>Review context</div><div className="mt-2 text-[10px] font-semibold leading-tight">{schema.secondary_cta || "Current work"}</div><div className="mt-4 space-y-2">{layoutGraph.slice(4,7).map((item,i)=><div key={item.id || item.label} className="border-b pb-2" style={{borderColor:theme.line}}><div className="flex text-[5px]"><span style={{color:theme.accent}}>0{i+1}</span><span className="ml-auto" style={{color:theme.muted}}>OPEN</span></div><div className="mt-1 text-[6px] font-medium">{item.label}</div></div>)}</div></aside></div></div>;
      if (shell === "topbar") return <div className="h-[360px] overflow-hidden" style={{background:theme.bg,color:theme.ink,fontFamily}}>{top}<div className="flex h-8 items-center gap-5 border-b px-3 text-[5px]" style={{borderColor:theme.line,background:theme.panel2}}>{navItems.slice(0,6).map((x,i)=><span key={x} className="pb-1" style={{color:i===1?theme.ink:theme.muted,borderBottom:i===1?`2px solid ${theme.accent}`:"2px solid transparent"}}>{x}</span>)}</div><main className={pad}><div className="grid grid-cols-[1.15fr_.85fr] items-end gap-3">{heading}<div className="grid grid-cols-2 gap-1">{layoutGraph.slice(0,2).map((node,index)=><div key={node.id||node.label}>{renderModule(node.label,index,"",node.type)}</div>)}</div></div><div className="mt-3 grid grid-cols-3 gap-2">{layoutGraph.slice(2,7).map((node,index)=><div key={node.id||node.label} className={index===0?"col-span-2":""}>{renderModule(node.label,index+2,"h-full",node.type)}</div>)}</div></main></div>;
      if (shell === "canvas") {
        const positions = [["4%","13%","31%"],["38%","5%","27%"],["69%","17%","27%"],["17%","58%","31%"],["53%","57%","38%"],["75%","67%","21%"]];
        return <div className="relative h-[360px] overflow-hidden" style={{background:theme.bg,color:theme.ink,fontFamily}}><div className="absolute inset-0 opacity-25" style={{backgroundImage:`radial-gradient(circle at 1px 1px,${theme.muted} 1px,transparent 0)`,backgroundSize:"18px 18px"}}/><div className="relative z-10 flex h-11 items-center px-3"><div className="text-[8px] font-bold">{schema.brand_name}</div><div className="ml-4 rounded-full border px-3 py-1 text-[5px]" style={{borderColor:theme.line,background:theme.panel}}>⌘ {finance?"Ask the ledger":"Command"}</div><div className="ml-auto text-[5px]" style={{color:theme.muted}}>Spatial flow · live</div></div><div className="relative z-10 px-3">{heading}</div><div className="absolute inset-x-3 bottom-3 top-[94px]">{layoutGraph.slice(0,6).map((node,index)=>{const pos=positions[index];return <div key={node.id||node.label} className="absolute" style={{left:pos[0],top:pos[1],width:pos[2]}}>{renderModule(node.label,index,"",node.type)}</div>})}</div></div>;
      }
      return <div className="h-[360px] overflow-hidden" style={{background:theme.bg,color:theme.ink,fontFamily}}>{top}{graphBody}</div>;
    }
    if (shell === "canvas") {
      return <div className="relative h-[360px] overflow-hidden" style={{ background: theme.bg, color: theme.ink, fontFamily }}>
        {top}<div className="absolute inset-x-0 bottom-0 top-10 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 1px 1px,${theme.muted} 1px,transparent 0)`, backgroundSize: "17px 17px" }}/>
        <div className="relative z-10 p-3">{heading}<div className="relative mt-4 h-[235px]">{blueprintModules.map((m,i)=>{const pos=[["2%","12%","34%"],["43%","6%","28%"],["64%","50%","31%"],["24%","62%","30%"]][i];return <div key={m} className="absolute" style={{left:pos[0],top:pos[1],width:pos[2]}}>{renderModule(m,i)}</div>})}</div></div>
      </div>;
    }
    if (shell === "split-pane") {
      return <div className="h-[360px] overflow-hidden" style={{ background: theme.bg, color: theme.ink, fontFamily }}>{top}<div className="grid h-[320px] grid-cols-[1.3fr_.7fr]"><main className={pad}>{heading}<div className="mt-3 grid grid-cols-2 gap-2">{blueprintModules.slice(0,3).map((m,i)=>renderModule(m,i,i===2?"col-span-2":""))}</div></main><aside className={`border-l ${pad}`} style={{borderColor:theme.line,background:theme.panel2}}><div className="text-[5px] uppercase tracking-[.14em]" style={{color:theme.accent}}>Context</div><div className="mt-2 text-[9px] font-semibold">{blueprintModules[3]}</div><div className="mt-3 space-y-2">{schema.services.slice(0,3).map((s,i)=><div key={s.title} className="rounded-md p-2 text-[5px]" style={{background:theme.panel}}><div style={{color:theme.accent}}>0{i+1}</div><div className="mt-1 font-medium">{s.title}</div></div>)}</div></aside></div></div>;
    }
    if (shell === "topbar") {
      return <div className="h-[360px] overflow-hidden" style={{ background: theme.bg, color: theme.ink, fontFamily }}>{top}<div className="border-b px-3 py-1.5 text-[5px]" style={{borderColor:theme.line,background:theme.panel}}>{navItems.map((x,i)=><span key={x} className={i===1?"mr-4 font-semibold":"mr-4"} style={{color:i===1?theme.ink:theme.muted}}>{x}</span>)}</div><main className={pad}>{heading}<div className="mt-3 grid grid-cols-4 gap-2">{blueprintModules.map((m,i)=>renderModule(m,i,i===0?"col-span-2":i===3?"col-span-2":""))}</div></main></div>;
    }
    const sideWidth = shell === "rail" ? "58px" : "104px";
    return <div className="h-[360px] overflow-hidden" style={{ background: theme.bg, color: theme.ink, fontFamily }}>{top}<div className="grid h-[320px]" style={{gridTemplateColumns:`${sideWidth} 1fr`}}><aside className="border-r p-2" style={{borderColor:theme.line,background:theme.panel2}}>{navItems.map((x,i)=><div key={x} className={`mb-1 rounded-md px-2 py-1.5 text-[5px] ${shell==="rail"?"truncate":""}`} style={{background:i===1?theme.accent:"transparent",color:i===1?(dark?"#061217":"#fff"):theme.muted}}>{shell==="rail"?x.slice(0,1):x}</div>)}</aside><main className={pad}>{heading}<div className="mt-3 grid grid-cols-2 gap-2">{blueprintModules.map((m,i)=>renderModule(m,i,i===2?"col-span-2":""))}</div></main></div></div>;
  }

  if (kind === "cinematic") {
    return <div className={`h-[360px] overflow-hidden text-white ${healthcare ? "bg-[#061924]" : "bg-[#0B0B0C]"}`}>
      <header className="flex h-10 items-center border-b border-white/10 px-4">
        <div className={`text-[8px] font-semibold tracking-[.24em] ${healthcare ? "text-[#7FE0D2]" : "text-[#E1B978]"}`}>{String(schema.brand_name || "FIELD").toUpperCase()}</div>
        <nav className="ml-auto flex gap-3 text-[6px] text-white/52">{nav.map((label)=><span key={label}>{label}</span>)}</nav>
        <span className="ml-3 rounded-full border border-[#E1B978]/45 px-2 py-1 text-[6px] text-[#EED19E]">{contact}</span>
      </header>
      <section className="relative mx-3 mt-3 h-[228px] overflow-hidden rounded-[12px] border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.42)]">
        {hero("linear-gradient(90deg,rgba(5,5,7,.82) 0%,rgba(5,5,7,.34) 55%,rgba(5,5,7,.10) 100%),linear-gradient(180deg,transparent 40%,rgba(5,5,7,.52) 100%)")}
        <div className="absolute inset-y-0 left-0 z-10 flex w-[64%] flex-col justify-end p-4">
          <div className={`mb-2 text-[6px] font-semibold uppercase tracking-[.23em] ${healthcare ? "text-[#7FE0D2]" : "text-[#E1B978]"}`}>{labels.cinematicKicker}</div>
          <div className="max-w-[270px] text-[27px] font-medium leading-[.93] tracking-[-.055em]">{schema.headline}</div>
          <div className="mt-2 max-w-[250px] text-[7px] leading-[1.4] text-white/66">{schema.subheadline}</div>
          <div className="mt-3 flex gap-1.5"><span className={`rounded-full px-2.5 py-1.5 text-[6px] font-semibold ${healthcare ? "bg-[#7FE0D2] text-[#08212A]" : "bg-[#E1B978] text-black"}`}>{schema.primary_cta}</span><span className="rounded-full border border-white/25 px-2.5 py-1.5 text-[6px] text-white/80">{schema.secondary_cta}</span></div>
        </div>
        <div className="absolute right-3 top-3 z-10 text-right text-[5px] uppercase tracking-[.18em] text-white/48"><div>FIELD 01</div><div className="mt-1">{labels.cinematicMeta}</div></div>
        {status ? <div className="absolute bottom-3 right-3 z-10 rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[5px] text-white/60 backdrop-blur-sm">{status}</div> : null}
      </section>
      <section className="grid grid-cols-3 gap-2 px-3 pb-3 pt-2.5">
        {schema.services.slice(0,3).map((service,index)=><div key={service.title} className="rounded-[9px] border border-white/10 bg-white/[.045] px-2.5 py-2"><div className={`text-[5px] tracking-[.18em] ${healthcare ? "text-[#7FE0D2]" : "text-[#E1B978]"}`}>0{index+1}</div><div className="mt-1.5 text-[8px] font-medium leading-[1.05] text-white/88">{service.title}</div></div>)}
      </section>
    </div>;
  }

  if (kind === "graphic") {
    if (healthcare) {
      return <div className="h-[360px] overflow-hidden bg-[#E8F6F8] text-[#0B2430]">
        <header className="flex h-11 items-center border-b border-[#5B5BD6]/12 px-4">
          <div className="text-[9px] font-semibold tracking-[-.03em]">{schema.brand_name}</div>
          <nav className="ml-auto flex gap-3 text-[6px] text-[#476571]">{nav.map((label)=><span key={label}>{label}</span>)}</nav>
          <span className="ml-3 rounded-full bg-[#0B2430] px-2.5 py-1.5 text-[6px] font-semibold text-white">{contact}</span>
        </header>
        <section className="relative mx-3 grid h-[234px] grid-cols-[.92fr_1.08fr] overflow-hidden rounded-[14px] bg-[#CDECEF] shadow-[0_18px_42px_rgba(15,46,56,.10)]">
          <div className="relative z-10 flex flex-col justify-center p-4">
            <div className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 text-[5px] font-semibold uppercase tracking-[.16em] text-[#16728A] shadow-sm"><span className="h-1.5 w-1.5 rounded-full bg-[#51B7A6]"/>Patient experience</div>
            <div className="max-w-[250px] text-[29px] font-semibold leading-[.91] tracking-[-.055em]">{schema.headline}</div>
            <div className="mt-2 max-w-[230px] text-[7px] leading-[1.45] text-[#5A717A]">{schema.subheadline}</div>
            <div className="mt-4 flex gap-1.5"><span className="rounded-full bg-[#0B2430] px-2.5 py-1.5 text-[6px] font-semibold text-white">{schema.primary_cta}</span><span className="rounded-full border border-[#8EB4BE] bg-white/60 px-2.5 py-1.5 text-[6px] font-semibold text-[#0B2430]">{schema.secondary_cta}</span></div>
          </div>
          <div className="relative m-2.5 overflow-hidden rounded-[11px] bg-[#9FD7DE]">
            {hero("linear-gradient(180deg,rgba(10,42,51,.02),rgba(10,42,51,.10))")}
            <div className="absolute right-3 top-3 z-10 rounded-full bg-white/88 px-2 py-1 text-[5px] font-semibold text-[#0B2430] shadow-sm">Care, clearly connected</div>
            {status ? <div className="absolute bottom-3 right-3 z-10 rounded-full bg-[#0B2430]/82 px-2 py-1 text-[5px] text-white backdrop-blur-sm">{status}</div> : null}
          </div>
        </section>
        <section className="grid h-[92px] grid-cols-[.8fr_1.2fr] gap-2 px-3 py-2.5">
          <div className="flex flex-col justify-between rounded-[10px] bg-[#0B2430] p-2.5 text-white"><div className="text-[5px] uppercase tracking-[.16em] text-[#8FD2C6]">Patient portal</div><div className="text-[10px] font-medium leading-[1.05]">One place for access, care and next steps.</div></div>
          <div className="grid grid-cols-3 gap-1.5">{schema.services.slice(0,3).map((service,index)=><div key={service.title} className="rounded-[10px] border border-[#C8DADF] bg-white px-2 py-2 shadow-[0_6px_14px_rgba(15,46,56,.05)]"><div className="text-[5px] text-[#1D8A99]">0{index+1}</div><div className="mt-1.5 line-clamp-2 text-[7px] font-semibold leading-[1.08]">{service.title}</div></div>)}</div>
        </section>
      </div>;
    }
    return <div className="h-[360px] overflow-hidden bg-[#F3E94F] text-[#101010]">
      <header className="flex h-10 items-center border-b border-black/25 px-4">
        <div className="text-[9px] font-black tracking-[-.04em]">{schema.brand_name}</div>
        <nav className="ml-auto flex gap-3 text-[6px] font-medium">{nav.map((label)=><span key={label}>{label}</span>)}</nav>
        <span className="ml-3 border border-black px-2 py-1 text-[6px] font-semibold">{contact} ↗</span>
      </header>
      <section className="grid h-[235px] grid-cols-[1.08fr_.92fr] border-b border-black/25">
        <div className="flex flex-col justify-between border-r border-black/25 p-4">
          <div className="text-[6px] font-bold uppercase tracking-[.20em] text-[#174B78]">{labels.graphicKicker}</div>
          <div><div className="max-w-[260px] text-[30px] font-black leading-[.88] tracking-[-.065em]">{schema.headline}</div><div className="mt-2 max-w-[245px] text-[7px] font-medium leading-[1.35]">{schema.subheadline}</div></div>
          <div className="flex gap-1.5"><span className="bg-black px-2.5 py-1.5 text-[6px] font-semibold text-white">{schema.primary_cta}</span><span className="border border-black px-2.5 py-1.5 text-[6px] font-semibold">{schema.secondary_cta}</span></div>
        </div>
        <div className="relative m-3 overflow-hidden border border-black/35 bg-[#FFF7B3] shadow-[6px_6px_0_#174B78]">
          {hero("linear-gradient(180deg,rgba(243,233,79,.03),rgba(23,75,120,.12))")}
          <div className="absolute left-2 top-2 z-10 rounded-full bg-[#174B78] px-2 py-1 text-[5px] font-bold uppercase tracking-[.14em] text-white">{labels.graphicBadge}</div>
          {status ? <div className="absolute bottom-2 right-2 z-10 bg-[#F3E94F] px-2 py-1 text-[5px] font-semibold text-black">{status}</div> : null}
        </div>
      </section>
      <section className="grid h-[75px] grid-cols-3">{schema.services.slice(0,3).map((service,index)=><div key={service.title} className="border-r border-black/25 px-3 py-2.5 last:border-r-0"><div className="text-[5px] font-bold text-[#174B78]">0{index+1}</div><div className="mt-1.5 line-clamp-2 text-[8px] font-bold leading-[1.05]">{service.title}</div></div>)}</section>
    </div>;
  }


  if (healthcare) {
    return <div className="h-[360px] overflow-hidden bg-[#ECE9FF] text-[#171A32]">
      <header className="flex h-11 items-center px-4">
        <div className="font-serif text-[10px] italic">{schema.brand_name}</div>
        <div className="ml-auto flex items-center gap-3 text-[5px] uppercase tracking-[.15em] text-[#5B5BD6]">{nav.slice(0,3).map((label)=><span key={label}>{label}</span>)}</div>
        <span className="ml-3 rounded-full border border-[#5B5BD6]/20 bg-white px-2 py-1 text-[6px] text-[#33336D]">{contact}</span>
      </header>
      <section className="relative mx-3 h-[235px] overflow-hidden rounded-[18px] bg-[#2F346B] text-white shadow-[0_20px_45px_rgba(34,38,88,.18)]">
        <div className="absolute inset-y-0 left-0 w-[52%] overflow-hidden">
          {hero("linear-gradient(180deg,rgba(57,31,31,.02),rgba(57,31,31,.22))")}
        </div>
        <div className="absolute left-[44%] top-5 z-10 h-[194px] w-[1px] bg-white/18"/>
        <div className="absolute right-0 top-0 z-10 flex h-full w-[53%] flex-col justify-center px-5">
          <div className="text-[5px] font-semibold uppercase tracking-[.22em] text-[#FF9D8D]">Human care, editorially told</div>
          <div className="mt-3 max-w-[220px] font-serif text-[26px] leading-[.92] tracking-[-.035em]">{schema.headline}</div>
          <div className="mt-2 max-w-[215px] text-[7px] leading-[1.4] text-white/62">{schema.subheadline}</div>
          <div className="mt-4 flex items-center gap-3"><span className="rounded-full bg-[#FF9D8D] px-2.5 py-1.5 text-[6px] font-semibold text-[#2A2340]">{schema.primary_cta}</span><span className="text-[6px] text-white/70 underline decoration-white/25 underline-offset-2">{schema.secondary_cta}</span></div>
        </div>
        <div className="absolute left-3 top-3 z-10 rounded-full border border-white/16 bg-black/10 px-2 py-1 text-[5px] uppercase tracking-[.14em] text-white/70">Care study 03</div>
        {status ? <div className="absolute bottom-3 left-3 z-10 rounded-full bg-[#F6F1EC]/90 px-2 py-1 text-[5px] text-[#5A3939]">{status}</div> : null}
      </section>
      <section className="grid h-[90px] grid-cols-[.72fr_1.28fr] gap-3 px-3 py-2.5">
        <div className="flex flex-col justify-center"><div className="text-[5px] uppercase tracking-[.17em] text-[#5B5BD6]">Care layers</div><div className="mt-1 font-serif text-[12px] leading-[1.03]">{schema.services_title}</div></div>
        <div className="grid grid-cols-3 gap-1.5">{schema.services.slice(0,3).map((service,index)=><div key={service.title} className="rounded-[10px] bg-[#F7F5FF] p-2 shadow-[0_6px_15px_rgba(57,54,110,.06)]"><div className="text-[5px] text-[#FF7E6B]">0{index+1}</div><div className="mt-1.5 line-clamp-2 text-[7px] font-medium leading-[1.08]">{service.title}</div></div>)}</div>
      </section>
    </div>;
  }

  return <div className="h-[360px] overflow-hidden bg-[#EFE5D6] text-[#171311]">
    <header className="flex h-10 items-center border-b border-[#A33C2C]/25 px-4">
      <div className="font-serif text-[10px] italic tracking-[-.02em]">{schema.brand_name}</div>
      <div className="ml-auto text-[5px] uppercase tracking-[.18em] text-[#8A3528]">{labels.tactileHeader}</div>
      <span className="ml-3 border-b border-[#171311] pb-[1px] text-[6px]">{contact}</span>
    </header>
    <section className="grid h-[235px] grid-cols-[.88fr_1.12fr] gap-3 p-3">
      <div className="relative overflow-hidden border border-[#8A3528]/25 bg-[#D6C2AA] shadow-[8px_8px_0_rgba(138,53,40,.12)]">
        {hero("linear-gradient(180deg,rgba(239,229,214,.02),rgba(60,32,24,.14))")}
        <div className="absolute bottom-2 left-2 z-10 bg-[#EFE5D6]/90 px-2 py-1 text-[5px] uppercase tracking-[.15em] text-[#8A3528]">{labels.tactileBadge}</div>
        {status ? <div className="absolute right-2 top-2 z-10 bg-[#EFE5D6]/90 px-2 py-1 text-[5px] text-[#6E574E]">{status}</div> : null}
      </div>
      <div className="flex flex-col justify-center border-y border-[#8A3528]/22 px-2 py-3">
        <div className="text-[6px] font-semibold uppercase tracking-[.20em] text-[#A33C2C]">{labels.tactileKicker}</div>
        <div className="mt-3 max-w-[260px] font-serif text-[27px] leading-[.91] tracking-[-.045em]">{schema.headline}</div>
        <div className="mt-2 max-w-[245px] text-[7px] leading-[1.4] text-[#6E574E]">{schema.subheadline}</div>
        <div className="mt-3 flex items-center gap-3"><span className="bg-[#171311] px-2.5 py-1.5 text-[6px] text-[#F4EBDD]">{schema.primary_cta}</span><span className="text-[6px] underline decoration-[#A33C2C]/50 underline-offset-2">{schema.secondary_cta}</span></div>
      </div>
    </section>
    <section className="grid h-[75px] grid-cols-[.7fr_1.3fr] border-t border-[#8A3528]/25 px-3 py-2.5">
      <div><div className="text-[5px] uppercase tracking-[.18em] text-[#A33C2C]">{labels.tactileNext}</div><div className="mt-1 font-serif text-[11px] leading-[1.05]">{schema.services_title}</div></div>
      <div className="grid grid-cols-3 gap-1.5">{schema.services.slice(0,3).map((service,index)=><div key={service.title} className="border-l border-[#8A3528]/20 pl-2"><div className="text-[5px] text-[#A33C2C]">{String(index+1).padStart(2,"0")}</div><div className="mt-1 line-clamp-2 text-[7px] font-medium leading-[1.05]">{service.title}</div></div>)}</div>
    </section>
  </div>;
}

export default function DesignPreviewRenderer({
  schema: rawSchema,
  heroImageUrl = null,
  supportImageUrl = null,
  heroImageStatus = null,
  supportImageStatus = null,
  heroImageProgress = 0,
  supportImageProgress = 0,
  heroImageElapsedSeconds = 0,
  supportImageElapsedSeconds = 0,
  compact = false,
}) {
  const schema = normalizeDesignSchema(rawSchema);
  if (schema.design_family === "field-service") {
    return <FieldServicePreview
      schema={schema}
      heroImageUrl={heroImageUrl}
      supportImageUrl={supportImageUrl}
      heroImageStatus={heroImageStatus}
      supportImageStatus={supportImageStatus}
      heroImageProgress={heroImageProgress}
      supportImageProgress={supportImageProgress}
      heroImageElapsedSeconds={heroImageElapsedSeconds}
      supportImageElapsedSeconds={supportImageElapsedSeconds}
    />;
  }
  const p = paletteFor(schema);
  const typography = String(schema.typography_character || "").toLowerCase();
  const shape = String(schema.shape_language || "").toLowerCase();
  const editorial = /editorial|serif|luxury/.test(typography);
  const headingStyle = editorial
    ? { fontFamily: "Georgia, 'Times New Roman', serif" }
    : /technical|geometric/.test(typography)
      ? { fontFamily: "Arial, Helvetica, sans-serif", letterSpacing: "-0.045em" }
      : undefined;
  const radius = /sharp|technical|minimal/.test(shape)
    ? "rounded-[4px]"
    : /soft|organic|rounded/.test(shape)
      ? "rounded-[28px]"
      : "rounded-[14px]";
  const buttonRadius = /sharp|technical|minimal/.test(shape) ? "rounded-[3px]" : /soft|organic|rounded/.test(shape) ? "rounded-full" : "rounded-[10px]";
  const navLabels = navLabelsFor(schema);
  const contactLabel = contactLabelFor(schema);
  const fullBleedHero = schema.hero_layout === "full-bleed";
  const offsetHero = schema.hero_layout === "offset-editorial";
  const storyRhythm = schema.section_rhythm === "story";
  const modularRhythm = schema.section_rhythm === "modular";
  const heroSectionClass = fullBleedHero
    ? "relative grid gap-0 py-6 lg:py-8"
    : offsetHero
      ? "grid gap-5 py-8 md:grid-cols-[.72fr_1.28fr] md:items-end lg:py-10"
      : "grid gap-7 py-8 md:grid-cols-[1.08fr_.92fr] md:items-center lg:py-10";

  if (compact) {
    return <CompactDesignPreview
      schema={schema}
      rawSchema={rawSchema}
      heroImageUrl={heroImageUrl}
      heroImageStatus={heroImageStatus}
      heroImageProgress={heroImageProgress}
    />;
  }

  return (
    <div style={{ background: p.bg, color: p.ink }} className="min-h-[760px] overflow-hidden font-sans">
      <div className="mx-auto max-w-[1280px] px-7 pb-8 pt-5 md:px-10 lg:px-14">
        <header className="flex items-center border-b pb-5" style={{ borderColor: p.border }}>
          <div className="text-[16px] font-semibold tracking-[-0.02em]">{schema.brand_name}</div>
          <nav className="ml-auto hidden items-center gap-7 text-[11px] md:flex" style={{ color: p.muted }}>
            {navLabels.map((label) => <span key={label}>{label}</span>)}
          </nav>
          <button className={`ml-7 border px-4 py-2 text-[10px] font-medium ${buttonRadius}`} style={{ borderColor: p.border }}>
            {contactLabel}
          </button>
        </header>

        <section className={heroSectionClass}>
          <div className={fullBleedHero ? "relative z-10 max-w-3xl px-5 py-8 text-white md:absolute md:bottom-10 md:left-10 md:px-0 md:py-0" : offsetHero ? "md:order-2 md:pb-8" : ""}>
            <div className="mb-5 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: fullBleedHero ? "#FFFFFFAA" : p.accent }}>{schema.eyebrow}</div>
            <h1 style={headingStyle} className="max-w-[760px] text-[48px] font-medium leading-[0.96] tracking-[-0.055em] md:text-[64px] lg:text-[76px]">{schema.headline}</h1>
            <p className="mt-7 max-w-[660px] text-[16px] leading-7 md:text-[18px]" style={{ color: fullBleedHero ? "#FFFFFFC4" : p.muted }}>{schema.subheadline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className={`inline-flex items-center gap-3 px-5 py-3 text-[11px] font-medium text-white ${buttonRadius}`} style={{ background: fullBleedHero ? "rgba(255,255,255,.16)" : p.dark, border: fullBleedHero ? "1px solid rgba(255,255,255,.35)" : "none" }}>{schema.primary_cta}<Arrow /></button>
              <button className={`border px-5 py-3 text-[11px] font-medium ${buttonRadius}`} style={{ borderColor: fullBleedHero ? "rgba(255,255,255,.35)" : p.border, color: fullBleedHero ? "white" : undefined }}>{schema.secondary_cta}</button>
            </div>
          </div>

          <div className={`relative overflow-hidden border shadow-[0_22px_60px_rgba(20,24,20,0.09)] ${fullBleedHero ? "min-h-[540px] rounded-[8px]" : offsetHero ? "min-h-[460px] md:order-1 rounded-[4px]" : `min-h-[390px] ${radius}`}`} style={{ background: p.surface, borderColor: p.border }}>
            {heroImageUrl ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(90deg,rgba(8,14,11,.58) 0%,rgba(8,14,11,.22) 44%,rgba(8,14,11,.03) 72%),linear-gradient(180deg,rgba(8,14,11,.02) 0%,rgba(8,14,11,.10) 52%,rgba(8,14,11,.42) 100%),url("${heroImageUrl}")` }}/> : null}
            {!heroImageUrl ? <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-70 blur-3xl" style={{ background: p.accentSoft }} /> : null}
            {heroImageUrl ? (
              <div className="relative flex min-h-[390px] items-end p-6">
                {fullBleedHero ? (
                  <div className="max-w-sm rounded-[10px] border border-white/15 bg-black/28 px-4 py-3 text-white shadow-xl backdrop-blur-[4px]">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/58">{humanLabel(schema.industry, "In context")}</div>
                    <div style={headingStyle} className="mt-2 text-[18px] leading-[1.12] tracking-[-0.025em] text-white/95">{schema.trust_line}</div>
                  </div>
                ) : null}
              </div>
            ) : heroImageStatus === "generating" ? (
              <div className="relative flex min-h-[410px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_35%_25%,#c8c0b5,transparent_32%),linear-gradient(135deg,#d8d2c8,#8f938c)]">
                <div className="absolute inset-0 animate-pulse bg-white/20 backdrop-blur-[10px]"/>
                <div className="absolute inset-y-0 -left-1/3 w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/45 to-transparent blur-xl" style={{ transform: `translateX(${Math.min(390, Number(heroImageProgress || 0) * 4)}%)` }}/>
                <div className="relative z-10 rounded-full border border-white/40 bg-black/35 px-4 py-2 text-center text-white/90 backdrop-blur-md">
                  <div className="text-[10px] font-medium">Generating hero image · ~{Math.max(8, Number(heroImageProgress || 8))}%</div>
                  <div className="mt-1 text-[8px] text-white/55">{Number(heroImageElapsedSeconds || 0)}s elapsed · Node01</div>
                </div>
              </div>
            ) : (
              <div className="relative flex h-full min-h-[410px] flex-col p-5" style={{ background: "rgba(255,255,255,.38)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.13em]" style={{ color: p.muted }}>Experience overview</span>
                  <span className="rounded-full px-2 py-1 text-[9px]" style={{ background: p.accentSoft, color: p.accent }}>{humanLabel(schema.industry, "Current")}</span>
                </div>
                <div className="mt-8 text-[11px]" style={{ color: p.muted }}>{schema.services_title}</div>
                <div className="mt-2 max-w-sm text-[34px] font-medium leading-tight tracking-[-0.04em]">{schema.closing_title}</div>
                <div className="mt-7 grid grid-cols-3 gap-2">
                  {schema.services.slice(0,3).map((service) => (
                    <div key={service.title} className="border p-3" style={{ borderColor: p.border, background: p.surface }}>
                      <div className="text-[8px] uppercase tracking-[0.11em]" style={{ color: p.muted }}>{service.title}</div>
                      <div className="mt-4 text-[11px] leading-5">{service.body}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto p-4" style={{ background: p.dark, color: "#F7F4EE" }}>
                  <div className="text-[9px] uppercase tracking-[0.12em] opacity-55">What matters</div>
                  <div className="mt-2 max-w-sm text-[12px] leading-5 opacity-90">{schema.trust_line}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="border-y py-5" style={{ borderColor: p.border }}>
          <div className="grid gap-4 md:grid-cols-[.7fr_1.3fr] md:items-center">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: p.accent }}>Built on trust</div>
            <div className="text-[13px] leading-6 md:text-[14px]" style={{ color: p.muted }}>{schema.trust_line}</div>
          </div>
        </section>

        <section className={storyRhythm ? "border-y py-8 lg:py-10" : "py-9 lg:py-11"} style={storyRhythm ? { borderColor: p.border } : undefined}>
          <div className={storyRhythm ? "grid gap-10 md:grid-cols-1" : modularRhythm ? "grid gap-8 md:grid-cols-[.65fr_1.35fr]" : "grid gap-8 md:grid-cols-[.8fr_1.2fr]"}>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: p.accent }}>What we do</div>
              <h2 className="mt-4 max-w-md text-[34px] font-medium leading-[1.02] tracking-[-0.045em] md:text-[42px]">{schema.services_title}</h2>
              <p className="mt-5 max-w-md text-[13px] leading-6" style={{ color: p.muted }}>{schema.services_intro}</p>
            </div>
            <div className={storyRhythm ? "grid gap-0 border-t" : modularRhythm ? "grid gap-3 md:grid-cols-2" : "grid gap-3 md:grid-cols-3"} style={storyRhythm ? { borderColor: p.border } : undefined}>
              {schema.services.slice(0,3).map((service, index) => (
                <article key={service.title} className={storyRhythm ? "grid min-h-0 gap-4 border-b py-5 md:grid-cols-[56px_.8fr_1.2fr] md:items-start" : modularRhythm ? "flex min-h-[176px] flex-col rounded-[8px] border p-5" : "flex min-h-[188px] flex-col rounded-[20px] border p-5"} style={{ background: storyRhythm ? "transparent" : p.surface, borderColor: p.border }}>
                  <div className="text-[9px] font-medium" style={{ color: p.accent }}>0{index + 1}</div>
                  <h3 className={storyRhythm ? "text-[22px] font-medium tracking-[-0.03em]" : "mt-7 text-[17px] font-medium tracking-[-0.025em]"}>{service.title}</h3>
                  <p className={storyRhythm ? "text-[12px] leading-6" : "mt-3 text-[11px] leading-5"} style={{ color: p.muted }}>{service.body}</p>
                  {!storyRhythm ? <div className="mt-auto pt-5 text-[13px]">→</div> : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`grid overflow-hidden ${storyRhythm ? "rounded-none" : editorial ? "rounded-[8px]" : "rounded-[28px]"} ${supportImageUrl || supportImageStatus === "generating" ? "md:grid-cols-[.82fr_1.08fr_.9fr]" : modularRhythm ? "md:grid-cols-[.72fr_1.28fr]" : "md:grid-cols-[1.05fr_.95fr]"}`} style={{ background: p.dark, color: "#F5F0E8" }}>
          {supportImageUrl ? <div className="min-h-[260px] bg-cover bg-center md:min-h-full" style={{ backgroundImage: `linear-gradient(180deg,rgba(10,14,12,.06),rgba(10,14,12,.2)),url("${supportImageUrl}")` }}/> : supportImageStatus === "generating" ? <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#303731,#6a665f)] md:min-h-full"><div className="absolute inset-0 animate-pulse bg-white/10 backdrop-blur-[9px]"/><div className="relative z-10 rounded-full border border-white/20 bg-black/30 px-3 py-2 text-center"><div className="text-[9px] font-medium text-white/85">Generating supporting image · ~{Math.max(8, Number(supportImageProgress || 8))}%</div><div className="mt-1 text-[8px] text-white/45">{Number(supportImageElapsedSeconds || 0)}s elapsed · Node01</div></div></div> : null}
          <div className="p-7 md:p-9 lg:p-10">
            <div className="text-[9px] uppercase tracking-[0.16em] opacity-50">The difference</div>
            <h2 style={headingStyle} className="mt-5 max-w-lg text-[34px] font-medium leading-[1.02] tracking-[-0.045em] md:text-[46px]">{schema.proof_title}</h2>
            <p className="mt-6 max-w-xl text-[13px] leading-6 opacity-65">{schema.proof_body}</p>
          </div>
          <div className={`grid border-t md:border-l md:border-t-0 ${supportImageUrl || supportImageStatus === "generating" ? "grid-rows-3" : "grid-cols-3"}`} style={{ borderColor: "rgba(255,255,255,.12)" }}>
            {schema.stats.map((stat) => (
              <div key={stat.label} className={`flex flex-col justify-end p-5 ${supportImageUrl || supportImageStatus === "generating" ? "border-b last:border-b-0" : "min-h-[190px] border-r last:border-r-0 md:min-h-0"}`} style={{ borderColor: "rgba(255,255,255,.12)" }}>
                <div className="text-[19px] font-medium tracking-[-0.03em]">{stat.value}</div>
                <div className="mt-2 text-[9px] leading-4 opacity-50">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-7 py-9 md:grid-cols-[1fr_auto] md:items-end lg:py-11">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: p.accent }}>Start a conversation</div>
            <h2 className="mt-4 max-w-3xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] md:text-[52px]">{schema.closing_title}</h2>
            <p className="mt-5 max-w-xl text-[13px] leading-6" style={{ color: p.muted }}>{schema.closing_body}</p>
          </div>
          <button className="inline-flex items-center gap-3 rounded-full px-5 py-3 text-[11px] font-medium text-white" style={{ background: p.dark }}>{schema.primary_cta}<Arrow /></button>
        </section>

        <footer className="flex flex-wrap items-center gap-3 border-t pt-5 text-[9px]" style={{ borderColor: p.border, color: p.muted }}>
          <span className="font-medium" style={{ color: p.ink }}>{schema.brand_name}</span>
          <span>{humanLabel(schema.industry, "Experience")}</span>
          <span className="ml-auto">{schema.trust_line}</span>
        </footer>
      </div>
    </div>
  );
}
