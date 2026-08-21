import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeOpenCVCameraTrackRuntime,
} from "@/lib/creative/tools/runtime/CreativeOpenCVCameraTrackRuntime";
import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_SPATIAL_PRODUCT_TWIN_RUNTIME_V10_OBSIDIAN";
const BROWSER_TOOL_ID = "chromium-playwright";

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback) => number(value, fallback) > 0 ? number(value, fallback) : fallback;
const browserSnapshotId = (project) => text(project?.metadata?.creative_tool_snapshots?.[BROWSER_TOOL_ID]?.snapshot_id);
const jobId = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);

function mediaKind(reference, requested) {
  const explicit = text(requested).toLowerCase();
  if (explicit === "image" || explicit === "video") return explicit;
  return /\.(png|jpe?g|webp)(?:\?|$)/i.test(reference) ? "image" : "video";
}

function mediaExtension(reference, kind) {
  if (kind === "video") return "mp4";
  const match = reference.match(/\.(png|jpe?g|webp)(?:\?|$)/i);
  return match?.[1]?.toLowerCase() === "jpeg" ? "jpg" : (match?.[1]?.toLowerCase() || "jpg");
}

function normalizeScene(scene, index) {
  const source = text(scene?.source_reference);
  const domain = text(scene?.domain);
  if (!source.startsWith("storage://")) throw new Error(`SPATIAL_PRODUCT_TWIN_STORAGE_SOURCE_REQUIRED:${index}`);
  if (!domain && text(scene?.overlay_mode).toLowerCase() !== "none") throw new Error(`SPATIAL_PRODUCT_TWIN_DOMAIN_REQUIRED:${index}`);

  const kind = mediaKind(source, scene?.source_kind);
  const anchor = ["left-top", "left-bottom", "right-top", "right-bottom"].includes(text(scene?.anchor).toLowerCase())
    ? text(scene.anchor).toLowerCase()
    : "left-top";
  const overlayMode = ["none", "quiet", "flow", "ai"].includes(text(scene?.overlay_mode).toLowerCase())
    ? text(scene.overlay_mode).toLowerCase()
    : "flow";
  const visualProfile = text(scene?.visual_profile).toLowerCase() === "obsidian_v8" ? "obsidian_v8" : "stable_v7";

  return {
    id: text(scene?.id) || `scene-${index + 1}`,
    source_reference: source,
    source_kind: kind,
    extension: mediaExtension(source, kind),
    source_in_seconds: Math.max(0, number(scene?.source_in_seconds, 0)),
    duration_seconds: positive(scene?.duration_seconds, 5),
    kicker: text(scene?.kicker || "AVANTIQO INTELLIGENCE").slice(0, 60),
    domain: domain.slice(0, 74),
    capabilities: Array.isArray(scene?.capabilities)
      ? scene.capabilities.map(text).filter(Boolean).slice(0, 4)
      : [],
    ai_signal: text(scene?.ai_signal).slice(0, 190),
    anchor,
    overlay_mode: overlayMode,
    accent: text(scene?.accent).toLowerCase() === "gold" ? "gold" : "ice",
    source_semantic_role: text(scene?.source_semantic_role).slice(0, 90),
    visual_profile: visualProfile,
  };
}

function normalizeScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("SPATIAL_PRODUCT_TWIN_SCENES_REQUIRED");
  return scenes.slice(0, 12).map(normalizeScene);
}

async function sourceBuffer(organizationId, reference) {
  const signed = await signCreativeStorageReference({
    organization_id: organizationId,
    reference,
    expires_in: 1200,
  });
  const response = await fetch(signed, { redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error(`SPATIAL_PRODUCT_TWIN_SOURCE_DOWNLOAD_FAILED:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function trackSamples(value) {
  const raw = value?.result?.samples || value?.samples || [];
  const samples = Array.isArray(raw) ? raw : [];
  return samples.slice(0, 180).map((sample) => ({
    time: Math.max(0, number(sample.time_seconds, 0)),
    x: number(sample.cumulative_x, 0),
    y: number(sample.cumulative_y, 0),
    rotation: number(sample.cumulative_rotation_degrees, 0),
  }));
}

function entrySource({ scenes, tracks, fps, width, height }) {
  return `
import React from 'react';
import {AbsoluteFill,Composition,Img,interpolate,OffthreadVideo,Sequence,staticFile,useCurrentFrame,registerRoot} from 'remotion';
const fps=${fps},width=${width},height=${height};
const scenes=${JSON.stringify(scenes)},tracks=${JSON.stringify(tracks)};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};
const font='Inter,Arial,Helvetica,sans-serif';
const nearest=(samples,t)=>{if(!samples?.length)return{x:0,y:0,rotation:0};let best=samples[0],d=Math.abs((best.time||0)-t);for(let i=1;i<samples.length;i++){const nd=Math.abs((samples[i].time||0)-t);if(nd<d){best=samples[i];d=nd;}}return best;};
const isV8=(scene)=>scene.visual_profile==='obsidian_v8';
const palette=(scene)=>isV8(scene)?{solid:'#d6a66a',soft:'rgba(214,166,106,.13)',glow:'rgba(214,166,106,.055)',line:'rgba(214,166,106,.19)'}:(scene.accent==='gold'?{solid:'#f1d19a',soft:'rgba(241,209,154,.27)',glow:'rgba(241,209,154,.10)',line:'rgba(241,209,154,.38)'}:{solid:'#c8f4ff',soft:'rgba(200,244,255,.24)',glow:'rgba(125,226,255,.09)',line:'rgba(200,244,255,.34)'});
const glass=(p,v8,strong=false)=>v8?({background:'linear-gradient(145deg,rgba(3,4,5,.16),rgba(13,12,11,.10) 58%,rgba(255,255,255,.018))',border:'1px solid '+p.soft,boxShadow:'0 18px 60px rgba(0,0,0,.12),inset 0 1px 0 rgba(255,255,255,.07)',backdropFilter:'blur(10px) saturate(108%)',WebkitBackdropFilter:'blur(10px) saturate(108%)'}):({background:strong?'linear-gradient(145deg,rgba(6,11,16,.82),rgba(17,26,32,.68) 58%,rgba(255,255,255,.055))':'linear-gradient(145deg,rgba(6,11,16,.72),rgba(24,32,38,.52))',border:'1px solid '+p.soft,boxShadow:'0 18px 55px rgba(0,0,0,.24),0 0 26px '+p.glow+',inset 0 1px 0 rgba(255,255,255,.15)',backdropFilter:'blur(18px) saturate(135%)',WebkitBackdropFilter:'blur(18px) saturate(135%)'});
const pos=(anchor,w=510,h=300,v8=false)=>({left:anchor.startsWith('left')?(v8?82:72):width-(v8?82:72)-w,top:anchor.endsWith('bottom')?height-(v8?86:72)-h:(v8?108:92)});
const uiVisibility=(frame,scene)=>{const total=Math.max(1,Math.round(scene.duration_seconds*fps));const v8=isV8(scene);const fadeIn=Math.max(6,Math.min(Math.round(fps*(v8?.9:.65)),Math.round(total*.25)));const fadeOut=Math.max(5,Math.min(Math.round(fps*(v8?.55:.35)),Math.round(total*.16)));return interpolate(frame,[0,fadeIn,Math.max(fadeIn,total-fadeOut),total],[0,1,1,0],clamp);};
const progress=(frame,scene)=>Math.max(0,Math.min(1,frame/Math.max(1,Math.round(scene.duration_seconds*fps)-1)));
const StableStack=({scene,frame})=>{if(scene.overlay_mode==='none')return null;const v8=isV8(scene),p=palette(scene),vis=uiVisibility(frame,scene),t=frame/fps,s=nearest(tracks[scene.id]||[],t);const ax=Math.max(-3,Math.min(3,-s.x*(v8?.018:.025))),ay=Math.max(-3,Math.min(3,-s.y*(v8?.014:.02))),ar=Math.max(-.18,Math.min(.18,-s.rotation*(v8?.012:.018)));const quiet=scene.overlay_mode==='quiet';const aiHero=scene.overlay_mode==='ai';const w=v8?(quiet?390:(aiHero?470:440)):(quiet?430:(aiHero?540:500)),h=v8?(quiet?118:(scene.capabilities.length?238:178)):(quiet?150:(scene.capabilities.length?300:215)),placement=pos(scene.anchor,w,h,v8);const transform='perspective('+(v8?2200:1800)+'px) translate3d('+ax+'px,'+ay+'px,0) rotateY('+ar+'deg)';const intro=interpolate(frame,[0,Math.max(6,Math.round(fps*(v8?.9:.65)))],[v8?6:10,0],clamp);const caps=scene.capabilities||[];return <div style={{position:'absolute',left:placement.left,top:placement.top,width:w,opacity:vis,transform:transform+' translateY('+intro+'px)'}}>
  <div style={{...glass(p,v8,true),borderRadius:v8?12:22,padding:v8?(quiet?'14px 16px':'16px 18px'):(quiet?'17px 19px':'19px 21px'),boxSizing:'border-box'}}>
    <div style={{display:'flex',alignItems:'center',gap:v8?7:10}}>{v8?null:<div style={{width:27,height:27,borderRadius:9,border:'1px solid '+p.line,display:'grid',placeItems:'center',fontFamily:font,fontSize:10,fontWeight:850,color:p.solid,background:p.glow}}>AI</div>}<div style={{fontFamily:font,fontSize:v8?8.5:10,fontWeight:v8?650:820,letterSpacing:v8?2.7:2.35,color:p.solid}}>{scene.kicker}</div></div>
    <div style={{fontFamily:font,fontSize:v8?(quiet?21:25):(quiet?25:30),fontWeight:v8?520:690,letterSpacing:v8?-.25:-.65,color:v8?'rgba(248,247,244,.96)':'#f7fafb',lineHeight:1.08,marginTop:v8?8:(quiet?9:11)}}>{scene.domain}</div>
    {scene.ai_signal?<div style={{fontFamily:font,fontSize:v8?(quiet?12.5:15):(quiet?14.5:18),fontWeight:v8?420:540,lineHeight:v8?1.38:1.32,color:v8?'rgba(244,241,234,.76)':'rgba(240,246,248,.89)',marginTop:v8?8:(quiet?8:12),maxWidth:w-(v8?36:42)}}>{scene.ai_signal}</div>:null}
    {!quiet&&caps.length?<div style={{marginTop:v8?12:16,paddingTop:v8?10:13,borderTop:'1px solid '+(v8?'rgba(255,255,255,.045)':'rgba(255,255,255,.07)')}}>
      <div style={{fontFamily:font,fontSize:v8?8:9.5,fontWeight:v8?620:790,letterSpacing:v8?2.15:1.9,color:v8?'rgba(242,237,227,.38)':'rgba(226,237,241,.47)',marginBottom:v8?7:8}}>{aiHero?'BUSINESS CONTEXT':'OPERATING FLOW'}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:v8?6:7}}>{caps.map((cap,i)=>{const start=(v8?1.05:.85)+i*(v8?.68:.55);const e=interpolate(frame,[Math.round(fps*start),Math.round(fps*(start+(v8?.48:.38)))],[0,1],clamp);const reached=t>=start+(v8?.48:.38);return <div key={cap} style={{opacity:e,border:'1px solid '+(reached?p.line:(v8?'rgba(255,255,255,.045)':'rgba(255,255,255,.07)')),borderRadius:v8?8:11,padding:v8?'6px 8px':'8px 10px',background:reached?p.glow:(v8?'rgba(255,255,255,.012)':'rgba(255,255,255,.025)'),fontFamily:font,fontSize:v8?10:11.5,fontWeight:v8?540:690,color:reached?(v8?'rgba(247,244,237,.86)':'#eef6f8'):(v8?'rgba(235,231,222,.43)':'rgba(225,235,239,.55)'),whiteSpace:'nowrap'}}>{v8?null:<span style={{color:p.solid,marginRight:6}}>•</span>}{cap}</div>;})}</div>
    </div>:null}
    {aiHero&&!quiet?<div style={{display:'flex',alignItems:'center',gap:v8?6:8,marginTop:v8?11:14,fontFamily:font,fontSize:v8?8:9.5,fontWeight:v8?620:790,letterSpacing:v8?1.75:1.55,color:v8?'rgba(240,234,224,.42)':'rgba(230,240,243,.54)'}}><span style={{color:p.solid}}>{v8?'UNDERSTAND':'OBSERVE'}</span><span>→</span><span style={{color:p.solid}}>{v8?'RECOMMEND':'REASON'}</span><span>→</span><span style={{color:p.solid}}>{v8?'APPROVE':'ACT WITH CONTROL'}</span>{v8?<><span>→</span><span style={{color:p.solid}}>EXECUTE</span></>:null}</div>:null}
  </div>
</div>;};
const Trace=({scene,frame})=>{if(scene.overlay_mode==='none'||scene.overlay_mode==='quiet')return null;const v8=isV8(scene),p=palette(scene),vis=uiVisibility(frame,scene),left=scene.anchor.startsWith('left'),x=left?(v8?505:560):width-(v8?505:560),dir=left?1:-1;return <svg width={width} height={height} style={{position:'absolute',inset:0,opacity:(v8?.11:.22)*vis,pointerEvents:'none'}}><path d={'M '+x+' '+(scene.anchor.endsWith('bottom')?(v8?770:760):(v8?315:300))+' C '+(x+dir*(v8?65:80))+' 460, '+(x+dir*(v8?105:130))+' 535, '+(x+dir*(v8?165:210))+' 540'} stroke={p.line} strokeWidth={v8?'.8':'1.2'} fill='none'/><circle cx={x+dir*(v8?165:210)} cy='540' r={v8?'2.2':'3.5'} fill={p.solid}/></svg>;};
const Source=({scene,index,frame})=>{const src=staticFile('scene-'+index+'.'+scene.extension);if(scene.source_kind==='image'){const z=1.015+progress(frame,scene)*.035;const drift=(scene.anchor.startsWith('left')?1:-1)*progress(frame,scene)*8;return <Img src={src} style={{width:'100%',height:'100%',objectFit:'cover',transform:'scale('+z+') translateX('+drift+'px)',transformOrigin:'center center'}}/>;}return <OffthreadVideo src={src} startFrom={Math.round(scene.source_in_seconds*fps)} volume={0} style={{width:'100%',height:'100%',objectFit:'cover'}}/>;};
const Scene=({scene,index})=>{const frame=useCurrentFrame();const v8=isV8(scene),left=scene.anchor.startsWith('left');return <AbsoluteFill style={{backgroundColor:'#020406',overflow:'hidden'}}><Source scene={scene} index={index} frame={frame}/>{!v8&&scene.overlay_mode!=='none'?<AbsoluteFill style={{background:left?'linear-gradient(90deg,rgba(0,0,0,.14),transparent 35%)':'linear-gradient(270deg,rgba(0,0,0,.14),transparent 35%)'}}/>:null}<Trace scene={scene} frame={frame}/><StableStack scene={scene} frame={frame}/></AbsoluteFill>;};
const Main=()=>{let cursor=0;return <AbsoluteFill style={{backgroundColor:'#020406'}}>{scenes.map((scene,index)=>{const d=Math.max(1,Math.round(scene.duration_seconds*fps)),from=cursor;cursor+=d;return <Sequence key={scene.id} from={from} durationInFrames={d}><Scene scene={scene} index={index}/></Sequence>;})}</AbsoluteFill>;};
const total=scenes.reduce((sum,s)=>sum+Math.max(1,Math.round(s.duration_seconds*fps)),0);
const Root=()=> <Composition id='SpatialProductTwin' component={Main} durationInFrames={total} fps={fps} width={width} height={height}/>;
registerRoot(Root);
`;
}

function renderScript({ entryPath, publicDir, outputPath, browserExecutable }) {
  return `
const {bundle}=require('/tmp/avantiqo-remotion/node_modules/@remotion/bundler');
const {renderMedia,selectComposition}=require('/tmp/avantiqo-remotion/node_modules/@remotion/renderer');
(async()=>{
  const browserExecutable=${JSON.stringify(browserExecutable)};
  const chromiumOptions={args:['--no-sandbox','--disable-dev-shm-usage']};
  const serveUrl=await bundle({entryPoint:${JSON.stringify(entryPath)},publicDir:${JSON.stringify(publicDir)}});
  const composition=await selectComposition({serveUrl,id:'SpatialProductTwin',browserExecutable,chromiumOptions});
  await renderMedia({composition,serveUrl,codec:'h264',outputLocation:${JSON.stringify(outputPath)},pixelFormat:'yuv420p',crf:15,browserExecutable,chromiumOptions,concurrency:1});
  console.log(JSON.stringify({durationInFrames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height,browserExecutable}));
})();
`;
}

async function prepareRenderRuntime(sandbox) {
  const command = [
    "set -e",
    "mkdir -p /tmp/avantiqo-remotion",
    "cd /tmp/avantiqo-remotion",
    "if [ ! -f package.json ]; then npm init -y >/dev/null 2>&1; fi",
    "if [ ! -f node_modules/remotion/package.json ]; then npm install --no-audit --no-fund react react-dom remotion @remotion/renderer @remotion/bundler; fi",
    "BROWSER=$(cd /tmp/avantiqo-browser && node -e \"process.stdout.write(require('playwright').chromium.executablePath())\")",
    "test -x \"$BROWSER\"",
    "MISSING=$(ldd \"$BROWSER\" 2>/dev/null | grep 'not found' || true)",
    "test -z \"$MISSING\"",
    "\"$BROWSER\" --version",
    "printf '\\nBROWSER_BINARY=%s\\n' \"$BROWSER\"",
  ].join("; ");
  const result = await CreativeSandboxRuntime.run({
    sandbox,
    cmd: "bash",
    args: ["-lc", command],
    timeout_ms: 240000,
    error_prefix: "CREATIVE_SPATIAL_RENDER_RUNTIME_PREPARE_FAILED",
  });
  const match = String(result.stdout || "").match(/BROWSER_BINARY=([^\r\n]+)/);
  const browserExecutable = match?.[1]?.trim() || null;
  if (!browserExecutable) throw new Error("CREATIVE_SPATIAL_BROWSER_BINARY_MISSING");
  return { browserExecutable, diagnostics: result };
}

export async function renderCreativeSpatialProductTwin({ organization_id, project, scenes, width = 1920, height = 1080, fps = 24 } = {}) {
  if (!text(organization_id)) throw new Error("SPATIAL_PRODUCT_TWIN_ORGANIZATION_REQUIRED");
  const snapshot = browserSnapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_PLAYWRIGHT_SNAPSHOT_REQUIRED");
  const normalized = normalizeScenes(scenes);
  const safeWidth = Math.max(640, Math.floor(positive(width, 1920)));
  const safeHeight = Math.max(360, Math.floor(positive(height, 1080)));
  const safeFps = Math.max(12, Math.floor(positive(fps, 24)));
  const identity = jobId({ contract: CONTRACT, organization_id, project_id: project?.id, normalized, safeWidth, safeHeight, safeFps, snapshot });
  const base = `/tmp/avantiqo-spatial-product-twin-v10-${identity}`;
  const publicDir = `${base}/public`;
  const entryPath = `${base}/index.jsx`;
  const scriptPath = `${base}/render.cjs`;
  const outputPath = `${base}/proof.mp4`;
  const tracks = {};
  const buffers = [];

  for (const scene of normalized) {
    const bufferPromise = sourceBuffer(organization_id, scene.source_reference);
    const trackingPromise = scene.source_kind === "video" && scene.overlay_mode !== "none"
      ? CreativeOpenCVCameraTrackRuntime.execute({
          organization_id,
          project,
          source_reference: scene.source_reference,
          sample_fps: 3,
          max_frames: 100,
        }).catch(() => ({ result: { samples: [] } }))
      : Promise.resolve({ result: { samples: [] } });
    const [buffer, tracking] = await Promise.all([bufferPromise, trackingPromise]);
    buffers.push(buffer);
    tracks[scene.id] = trackSamples(tracking);
  }

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 900000,
    network_policy: "allow-all",
  });
  try {
    const prepared = await prepareRenderRuntime(sandbox);
    await CreativeSandboxRuntime.run({ sandbox, cmd: "mkdir", args: ["-p", publicDir] });
    await sandbox.writeFiles(buffers.map((buffer, index) => ({
      path: `${publicDir}/scene-${index}.${normalized[index].extension}`,
      content: buffer,
    })));
    await CreativeSandboxRuntime.writeText({ sandbox, path: entryPath, content: entrySource({ scenes: normalized, tracks, fps: safeFps, width: safeWidth, height: safeHeight }) });
    await CreativeSandboxRuntime.writeText({ sandbox, path: scriptPath, content: renderScript({ entryPath, publicDir, outputPath, browserExecutable: prepared.browserExecutable }) });
    const execution = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "node",
      args: [scriptPath],
      timeout_ms: 840000,
      error_prefix: "CREATIVE_SPATIAL_PRODUCT_TWIN_RENDER_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({ sandbox, path: outputPath });
    let metadata = null;
    try { metadata = JSON.parse(execution.stdout || "null"); } catch { metadata = null; }
    const trackedVideoScenes = normalized.filter((scene) => scene.source_kind === "video" && scene.overlay_mode !== "none");
    const trackingProven = trackedVideoScenes.every((scene) => (tracks[scene.id] || []).length > 0);
    const obsidian = normalized.some((scene) => scene.visual_profile === "obsidian_v8");
    return {
      contract: CONTRACT,
      buffer,
      mime_type: "video/mp4",
      width: safeWidth,
      height: safeHeight,
      fps: safeFps,
      duration_seconds: normalized.reduce((sum, scene) => sum + scene.duration_seconds, 0),
      spatial_glass_tracking_proven: trackingProven,
      visual_language: obsidian ? "OBSIDIAN_CINEMATIC_INTELLIGENCE_V8" : "STABLE_SUBJECT_SAFE_INTELLIGENCE_V2",
      full_screen_ui_ratio: 0,
      whole_scene_fade_to_black: false,
      ui_motion_policy: obsidian ? "SLOW_CONTEXTUAL_REVEAL_HOLD_DISSOLVE" : "ENTER_ONCE_HOLD_EXIT_ONCE",
      authentic_screen_capture_used: false,
      generated_replacement_footage_used: false,
      metadata,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox).catch(() => {});
  }
}

export const CreativeSpatialProductTwinRuntime = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeSpatialProductTwin,
});