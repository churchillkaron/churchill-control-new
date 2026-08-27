const CONTRACT = "AVANTIQO_MUSIC_ARRANGEMENT_V1";
const SECTION_TYPES = Object.freeze(["intro","verse","pre_chorus","chorus","post_chorus","bridge","breakdown","solo","outro","custom"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value,min,max,fallback=min) { return Math.max(min,Math.min(max,finite(value,fallback))); }
function id(value,prefix) { return text(value) || `${prefix}-${crypto.randomUUID()}`; }

export function createMusicArrangementSection(input = {}) {
  const type = text(input.type || "custom").toLowerCase();
  if (!SECTION_TYPES.includes(type)) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_TYPE_INVALID");
  const startBeat = Math.max(0,finite(input.start_beat,0));
  const durationBeats = clamp(input.duration_beats,0.25,100000,16);
  return {
    id:id(input.id,"section"),
    type,
    name:text(input.name || type.replaceAll("_"," ")).slice(0,80),
    start_beat:startBeat,
    duration_beats:durationBeats,
    end_beat:startBeat+durationBeats,
    color_token:text(input.color_token) || null,
    intensity:clamp(input.intensity,0,1,0.5),
    repeat_of_section_id:text(input.repeat_of_section_id) || null,
    locked:input.locked === true,
    notes:text(input.notes).slice(0,500) || null,
  };
}

export function createMusicArrangement(input = {}) {
  return {
    contract:CONTRACT,
    sections:Array.isArray(input.sections) ? input.sections.map(createMusicArrangementSection) : [],
    markers:Array.isArray(input.markers) ? input.markers.map((marker)=>({id:id(marker.id,"marker"),beat:Math.max(0,finite(marker.beat,0)),name:text(marker.name || "Marker").slice(0,80)})) : [],
    active_section_id:text(input.active_section_id) || null,
    non_destructive:true,
    source_clips_preserved:true,
    provider_job_submitted:false,
  };
}

export function ensureMusicArrangement(value = {}) {
  const source = value?.contract === CONTRACT ? structuredClone(value) : createMusicArrangement(value);
  if (!Array.isArray(source.sections)) source.sections=[];
  if (!Array.isArray(source.markers)) source.markers=[];
  source.sections=source.sections.map(createMusicArrangementSection).sort((a,b)=>a.start_beat-b.start_beat);
  source.non_destructive=true;
  source.source_clips_preserved=true;
  source.provider_job_submitted=false;
  return source;
}

export function normalizeMusicArrangementSections(arrangement = {}) {
  const next=ensureMusicArrangement(arrangement);
  next.sections.sort((a,b)=>a.start_beat-b.start_beat);
  for (let index=0;index<next.sections.length;index+=1) {
    const section=next.sections[index];
    section.end_beat=section.start_beat+section.duration_beats;
    const following=next.sections[index+1];
    if (following && section.end_beat > following.start_beat + 1e-6) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_OVERLAP");
  }
  return next;
}

export function addMusicArrangementSection(arrangement = {}, input = {}) {
  const next=ensureMusicArrangement(arrangement);
  next.sections.push(createMusicArrangementSection(input));
  return normalizeMusicArrangementSections(next);
}

export function updateMusicArrangementSection(arrangement = {}, sectionId, patch = {}) {
  const next=ensureMusicArrangement(arrangement);
  const index=next.sections.findIndex((section)=>section.id===sectionId);
  if (index<0) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_NOT_FOUND");
  next.sections[index]=createMusicArrangementSection({...next.sections[index],...patch,id:next.sections[index].id});
  return normalizeMusicArrangementSections(next);
}

export function removeMusicArrangementSection(arrangement = {}, sectionId) {
  const next=ensureMusicArrangement(arrangement);
  const before=next.sections.length;
  next.sections=next.sections.filter((section)=>section.id!==sectionId);
  if (next.sections.length===before) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_NOT_FOUND");
  if (next.active_section_id===sectionId) next.active_section_id=null;
  return next;
}

export function buildMusicArrangementTemplate({ bars_per_section = 8, beats_per_bar = 4, template = "standard" } = {}) {
  const bars=Math.round(clamp(bars_per_section,1,64,8));
  const beats=clamp(beats_per_bar,1,12,4);
  const names = text(template).toLowerCase()==="short"
    ? [["intro",0.5],["verse",1],["chorus",1],["verse",1],["chorus",1],["outro",0.5]]
    : [["intro",0.5],["verse",1],["pre_chorus",0.5],["chorus",1],["verse",1],["pre_chorus",0.5],["chorus",1],["bridge",1],["chorus",1],["outro",0.5]];
  let beat=0;
  const sections=names.map(([type,multiplier],index)=>{
    const duration=Math.max(beats,bars*beats*multiplier);
    const section=createMusicArrangementSection({type,name:`${type.replaceAll("_"," ")} ${index+1}`,start_beat:beat,duration_beats:duration,intensity:type==="chorus"?0.9:type==="bridge"?0.7:type==="intro"||type==="outro"?0.35:0.6});
    beat+=duration;
    return section;
  });
  return createMusicArrangement({sections});
}

export function validateMusicArrangement(arrangement = {}) {
  const normalized=normalizeMusicArrangementSections(arrangement);
  if (normalized.sections.length>256) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_LIMIT_INVALID");
  const ids=new Set();
  for (const section of normalized.sections) {
    if (!section.id || ids.has(section.id)) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_ID_INVALID");
    ids.add(section.id);
    if (section.repeat_of_section_id && !normalized.sections.some((entry)=>entry.id===section.repeat_of_section_id)) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_REPEAT_SOURCE_INVALID");
  }
  return {success:true,contract:"AVANTIQO_MUSIC_ARRANGEMENT_VALIDATION_V1",section_count:normalized.sections.length,non_destructive:true,provider_job_submitted:false};
}

export const CreativeMusicArrangementRuntime = {
  contract:CONTRACT,
  sectionTypes:SECTION_TYPES,
  create:createMusicArrangement,
  ensure:ensureMusicArrangement,
  createSection:createMusicArrangementSection,
  addSection:addMusicArrangementSection,
  updateSection:updateMusicArrangementSection,
  removeSection:removeMusicArrangementSection,
  template:buildMusicArrangementTemplate,
  validate:validateMusicArrangement,
};
