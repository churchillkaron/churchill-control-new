import { deriveMusicStereoDownmixMatrix, normalizeMusicSpatialLayout } from "../runtime/CreativeMusicSpatialAudioRuntime.js";

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max, fallback = 0) { return Math.max(min, Math.min(max, finite(value, fallback))); }
function dbToGain(db) { return db <= -119 ? 0 : 10 ** (finite(db, 0) / 20); }
function wrapDegrees(value) { let n = finite(value, 0) % 360; if (n > 180) n -= 360; if (n < -180) n += 360; return n; }
function angularDistance(a, b) { return Math.abs(wrapDegrees(a - b)); }

const AZIMUTHS = Object.freeze({
  stereo: Object.freeze({ L: -30, R: 30 }),
  "5.1": Object.freeze({ L: -30, R: 30, C: 0, Ls: -110, Rs: 110 }),
  "7.1": Object.freeze({ L: -30, R: 30, C: 0, Ls: -90, Rs: 90, Lrs: -150, Rrs: 150 }),
});

export function deriveMusicPointSpeakerGains(layoutInput, azimuthDegrees = 0, divergencePercent = 0) {
  const layout = normalizeMusicSpatialLayout(layoutInput);
  const azimuth = wrapDegrees(azimuthDegrees);
  const speakers = layout.speaker_order.filter((speaker) => speaker !== "LFE" && Number.isFinite(AZIMUTHS[layout.id]?.[speaker]));
  if (!speakers.length) return {};
  const ranked = speakers.map((speaker) => ({ speaker, distance: angularDistance(azimuth, AZIMUTHS[layout.id][speaker]) })).sort((a, b) => a.distance - b.distance);
  const primary = ranked[0];
  const secondary = ranked[1] || primary;
  const denominator = Math.max(1e-9, primary.distance + secondary.distance);
  const t = primary.distance === 0 ? 0 : primary.distance / denominator;
  const focused = Object.fromEntries(speakers.map((speaker) => [speaker, 0]));
  focused[primary.speaker] = Math.cos(t * Math.PI / 2);
  focused[secondary.speaker] = Math.sin(t * Math.PI / 2);
  const divergence = clamp(divergencePercent, 0, 100, 0) / 100;
  const diffuseGain = 1 / Math.sqrt(speakers.length);
  const gains = {};
  let energy = 0;
  for (const speaker of speakers) {
    const value = focused[speaker] * (1 - divergence) + diffuseGain * divergence;
    gains[speaker] = value;
    energy += value * value;
  }
  const normalization = energy > 1 ? 1 / Math.sqrt(energy) : 1;
  for (const speaker of speakers) gains[speaker] = Number((gains[speaker] * normalization).toFixed(8));
  return gains;
}

function lowPassCascade(samples, sampleRate, cutoffHz) {
  const output = new Float32Array(samples.length);
  const cutoff = Math.max(20, Math.min(sampleRate * 0.4, finite(cutoffHz, 120)));
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = finite(samples[i], 0);
    s1 += alpha * (x - s1); s2 += alpha * (s1 - s2); s3 += alpha * (s2 - s3); s4 += alpha * (s3 - s4);
    output[i] = s4;
  }
  return output;
}

function ensureChannelLength(channels, frames) {
  for (let i = 0; i < channels.length; i += 1) {
    if (channels[i].length >= frames) continue;
    const next = new Float32Array(frames); next.set(channels[i]); channels[i] = next;
  }
}

export function mixMusicTrackIntoSpatialChannels({ output_channels, layout: layoutInput, left, right = null, spatial = {}, sample_rate = 48000, lfe_low_pass_hz = 120 } = {}) {
  const layout = normalizeMusicSpatialLayout(layoutInput);
  const frames = Math.max(left?.length || 0, right?.length || 0);
  if (!frames) return output_channels;
  const channels = output_channels || Array.from({ length: layout.channel_count }, () => new Float32Array(frames));
  ensureChannelLength(channels, frames);
  const index = new Map(layout.speaker_order.map((speaker, channel) => [speaker, channel]));
  const l = left || new Float32Array(frames);
  const r = right || l;
  const mode = String(spatial.mode || "BED").toUpperCase();
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) mono[i] = (finite(l[i], 0) + finite(r[i], 0)) * 0.5;

  const addMonoWithGains = (signal, gains) => {
    for (const [speaker, gain] of Object.entries(gains || {})) {
      const channel = index.get(speaker); if (channel == null || !gain) continue;
      const out = channels[channel]; for (let i = 0; i < frames; i += 1) out[i] += signal[i] * gain;
    }
  };

  if (mode === "POINT") {
    addMonoWithGains(mono, deriveMusicPointSpeakerGains(layout.id, spatial.azimuth_degrees, spatial.divergence_percent));
  } else if (mode === "WIDE") {
    const widthDegrees = clamp(spatial.width_percent, 0, 200, 100) * 0.6;
    const leftGains = deriveMusicPointSpeakerGains(layout.id, finite(spatial.azimuth_degrees, 0) - widthDegrees / 2, spatial.divergence_percent);
    const rightGains = deriveMusicPointSpeakerGains(layout.id, finite(spatial.azimuth_degrees, 0) + widthDegrees / 2, spatial.divergence_percent);
    addMonoWithGains(l, Object.fromEntries(Object.entries(leftGains).map(([speaker, gain]) => [speaker, gain / Math.SQRT2])));
    addMonoWithGains(r, Object.fromEntries(Object.entries(rightGains).map(([speaker, gain]) => [speaker, gain / Math.SQRT2])));
  } else {
    if (index.has("L")) { const out = channels[index.get("L")]; for (let i = 0; i < frames; i += 1) out[i] += finite(l[i], 0); }
    if (index.has("R")) { const out = channels[index.get("R")]; for (let i = 0; i < frames; i += 1) out[i] += finite(r[i], 0); }
    const centerGain = dbToGain(spatial.center_send_db);
    if (centerGain && index.has("C")) { const out = channels[index.get("C")]; for (let i = 0; i < frames; i += 1) out[i] += mono[i] * centerGain; }
    const surroundSpeakers = ["Ls", "Rs", "Lrs", "Rrs"].filter((speaker) => index.has(speaker));
    const surroundGain = dbToGain(spatial.surround_send_db);
    if (surroundGain && surroundSpeakers.length) {
      const each = surroundGain / Math.sqrt(surroundSpeakers.length);
      for (const speaker of surroundSpeakers) { const out = channels[index.get(speaker)]; for (let i = 0; i < frames; i += 1) out[i] += mono[i] * each; }
    }
  }

  const lfeGain = dbToGain(spatial.lfe_send_db);
  if (lfeGain && index.has("LFE")) {
    const filtered = lowPassCascade(mono, sample_rate, lfe_low_pass_hz);
    const out = channels[index.get("LFE")]; for (let i = 0; i < frames; i += 1) out[i] += filtered[i] * lfeGain;
  }
  return channels;
}


function laneValueAtTime(lane,time){const points=lane?.points||[];if(!points.length)return null;let prev=null,next=null;for(const p of points){if(p.time_seconds<=time)prev=p;if(p.time_seconds>=time){next=p;break;}}if(!prev)return points[0].value;if(!next)return prev.value;if(next.time_seconds===prev.time_seconds||lane.interpolation==="step")return prev.value;const t=(time-prev.time_seconds)/(next.time_seconds-prev.time_seconds);return prev.value+(next.value-prev.value)*Math.max(0,Math.min(1,t));}

export function applyMusicSpatialSendGainAutomation(left,right,sampleRate,send,lane=null,timelineOffsetSeconds=0){const frames=Math.max(left?.length||0,right?.length||0),l=new Float32Array(frames),r=new Float32Array(frames),base=finite(send?.level_db,-18);for(let i=0;i<frames;i++){const automated=lane?.enabled!==false?laneValueAtTime(lane,timelineOffsetSeconds+i/sampleRate):null;const gain=dbToGain(Number.isFinite(automated)?automated:base);l[i]=finite(left?.[i],0)*gain;r[i]=finite(right?.[i],0)*gain;}return{left:l,right:r};}

export function sumMusicStereoSendPair(target,source){const frames=Math.max(target?.left?.length||0,source?.left?.length||0),left=new Float32Array(frames),right=new Float32Array(frames);for(let i=0;i<frames;i++){left[i]=finite(target?.left?.[i],0)+finite(source?.left?.[i],0);right[i]=finite(target?.right?.[i],0)+finite(source?.right?.[i],0);}return{left,right};}


export function musicSpatialAutomationValueAt(lane,timeSeconds,fallback=0){const points=lane?.points||[];if(lane?.enabled===false||!points.length)return fallback;const time=Math.max(0,finite(timeSeconds,0));let previous=null,next=null;for(const point of points){if(point.time_seconds<=time)previous=point;if(point.time_seconds>=time){next=point;break;}}if(!previous)return finite(points[0].value,fallback);if(!next)return finite(previous.value,fallback);if(next.time_seconds===previous.time_seconds||lane.interpolation==="step")return finite(previous.value,fallback);const progress=(time-previous.time_seconds)/(next.time_seconds-previous.time_seconds);return finite(previous.value,fallback)+(finite(next.value,fallback)-finite(previous.value,fallback))*Math.max(0,Math.min(1,progress));}

export function mixMusicTrackIntoSpatialChannelsAutomated({output_channels,layout:layoutInput,left,right=null,spatial={},sample_rate=48000,lfe_low_pass_hz=120,automation_lanes=[],timeline_offset_seconds=0}={}){
  const relevant=(automation_lanes||[]).filter(l=>l.enabled!==false&&String(l.parameter||"").startsWith("spatial:")&&(l.points||[]).length);
  if(!relevant.length)return mixMusicTrackIntoSpatialChannels({output_channels,layout:layoutInput,left,right,spatial,sample_rate,lfe_low_pass_hz});
  const mode=String(spatial.mode||"BED").toUpperCase();if(!["POINT","WIDE"].includes(mode))throw new Error("CREATIVE_MUSIC_SPATIAL_AUTOMATION_REQUIRES_POINT_OR_WIDE");
  const layout=normalizeMusicSpatialLayout(layoutInput),frames=Math.max(left?.length||0,right?.length||0),channels=output_channels||Array.from({length:layout.channel_count},()=>new Float32Array(frames));ensureChannelLength(channels,frames);const index=new Map(layout.speaker_order.map((speaker,channel)=>[speaker,channel])),l=left||new Float32Array(frames),r=right||l,mono=new Float32Array(frames);for(let i=0;i<frames;i++)mono[i]=(finite(l[i],0)+finite(r[i],0))*.5;
  const laneMap=new Map(relevant.map(lane=>[lane.parameter,lane]));const value=(parameter,time,fallback)=>musicSpatialAutomationValueAt(laneMap.get(parameter),time,fallback);const speakers=layout.speaker_order.filter(s=>s!=="LFE"),blockSize=64;
  const gainsAt=(time,side=0)=>{const az=value("spatial:azimuth_degrees",time,finite(spatial.azimuth_degrees,0)),div=value("spatial:divergence_percent",time,finite(spatial.divergence_percent,50));if(mode==="POINT")return deriveMusicPointSpeakerGains(layout.id,az,div);const width=value("spatial:width_percent",time,finite(spatial.width_percent,100))*.6;return deriveMusicPointSpeakerGains(layout.id,az+(side<0?-width/2:width/2),div);};
  for(let start=0;start<frames;start+=blockSize){const end=Math.min(frames,start+blockSize),t0=timeline_offset_seconds+start/sample_rate,t1=Math.max(t0,timeline_offset_seconds+(end-1)/sample_rate);if(mode==="POINT"){const a=gainsAt(t0),b=gainsAt(t1);for(const speaker of speakers){const ch=index.get(speaker);if(ch==null)continue;const g0=finite(a[speaker],0),g1=finite(b[speaker],0),out=channels[ch];for(let i=start;i<end;i++){const p=end-start<=1?0:(i-start)/(end-start-1);out[i]+=mono[i]*(g0+(g1-g0)*p);}}}else{const al=gainsAt(t0,-1),bl=gainsAt(t1,-1),ar=gainsAt(t0,1),br=gainsAt(t1,1);for(const speaker of speakers){const ch=index.get(speaker);if(ch==null)continue;const l0=finite(al[speaker],0)/Math.SQRT2,l1=finite(bl[speaker],0)/Math.SQRT2,r0=finite(ar[speaker],0)/Math.SQRT2,r1=finite(br[speaker],0)/Math.SQRT2,out=channels[ch];for(let i=start;i<end;i++){const p=end-start<=1?0:(i-start)/(end-start-1);out[i]+=finite(l[i],0)*(l0+(l1-l0)*p)+finite(r[i],0)*(r0+(r1-r0)*p);}}}}
  const lfeGain=dbToGain(spatial.lfe_send_db);if(lfeGain&&index.has("LFE")){const filtered=lowPassCascade(mono,sample_rate,lfe_low_pass_hz),out=channels[index.get("LFE")];for(let i=0;i<frames;i++)out[i]+=filtered[i]*lfeGain;}return channels;
}

export function analyseMusicDiscreteChannels(channels = [], speakerOrder = []) {
  const perSpeaker = [];
  let globalPeak = 0, sumSquares = 0, samples = 0;
  for (let c = 0; c < channels.length; c += 1) {
    const data = channels[c]; let peak = 0, power = 0;
    for (let i = 0; i < data.length; i += 1) { const v = finite(data[i], 0); peak = Math.max(peak, Math.abs(v)); power += v * v; globalPeak = Math.max(globalPeak, Math.abs(v)); sumSquares += v * v; samples += 1; }
    const toDb = (v) => v > 0 ? 20 * Math.log10(v) : -Infinity;
    perSpeaker.push({ speaker: speakerOrder[c] || `CH${c + 1}`, peak_dbfs: toDb(peak), rms_dbfs: toDb(Math.sqrt(power / Math.max(1, data.length))), clipping: peak >= 0.999 });
  }
  const toDb = (v) => v > 0 ? 20 * Math.log10(v) : -Infinity;
  return { contract: "AVANTIQO_MUSIC_DISCRETE_CHANNEL_ANALYSIS_V1", peak_dbfs: toDb(globalPeak), rms_dbfs: toDb(Math.sqrt(sumSquares / Math.max(1, samples))), clipping: globalPeak >= 0.999, per_speaker: perSpeaker };
}

export function downmixMusicSpatialChannelsToStereo(channels = [], layoutInput = "5.1") {
  const layout = normalizeMusicSpatialLayout(layoutInput);
  const matrix = deriveMusicStereoDownmixMatrix(layout.id);
  const frames = Math.max(0, ...channels.map((channel) => channel.length));
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const index = new Map(layout.speaker_order.map((speaker, i) => [speaker, i]));
  for (const speaker of layout.speaker_order) {
    const data = channels[index.get(speaker)] || new Float32Array(frames);
    const lg = finite(matrix.left[speaker], 0), rg = finite(matrix.right[speaker], 0);
    for (let i = 0; i < frames; i += 1) { const v = finite(data[i], 0); left[i] += v * lg; right[i] += v * rg; }
  }
  return { contract: "AVANTIQO_MUSIC_SPATIAL_STEREO_DOWNMIX_V1", left, right, matrix };
}
