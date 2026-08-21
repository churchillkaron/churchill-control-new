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

const CONTRACT = "CREATIVE_SPATIAL_PRODUCT_TWIN_RUNTIME_V8";
const BROWSER_TOOL_ID = "chromium-playwright";

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback) => number(value, fallback) > 0 ? number(value, fallback) : fallback;
const browserSnapshotId = (project) => text(project?.metadata?.creative_tool_snapshots?.[BROWSER_TOOL_ID]?.snapshot_id);
const jobId = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);

function visualMode(id) {
  return [...text(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
}

function normalizeScene(scene, index) {
  const source = text(scene?.source_reference);
  const domain = text(scene?.domain);
  if (!source.startsWith("storage://")) throw new Error(`SPATIAL_PRODUCT_TWIN_STORAGE_SOURCE_REQUIRED:${index}`);
  if (!domain) throw new Error(`SPATIAL_PRODUCT_TWIN_DOMAIN_REQUIRED:${index}`);
  const capabilities = Array.isArray(scene?.capabilities)
    ? scene.capabilities.map(text).filter(Boolean).slice(0, 4)
    : [];
  const id = text(scene?.id) || `scene-${index + 1}`;
  return {
    id,
    source_reference: source,
    source_in_seconds: Math.max(0, number(scene?.source_in_seconds, 0)),
    duration_seconds: positive(scene?.duration_seconds, 5),
    kicker: text(scene?.kicker || "AVANTIQO INTELLIGENCE").slice(0, 50),
    domain: domain.slice(0, 64),
    capabilities,
    ai_signal: text(scene?.ai_signal).slice(0, 180),
    side: text(scene?.side).toLowerCase() === "left" ? "left" : "right",
    accent: text(scene?.accent).toLowerCase() === "gold" ? "gold" : "ice",
    mode: visualMode(id),
  };
}

function normalizeScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("SPATIAL_PRODUCT_TWIN_SCENES_REQUIRED");
  return scenes.slice(0, 8).map(normalizeScene);
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
import {AbsoluteFill,Composition,interpolate,OffthreadVideo,Sequence,staticFile,useCurrentFrame,registerRoot} from 'remotion';
const fps=${fps},width=${width},height=${height};
const scenes=${JSON.stringify(scenes)},tracks=${JSON.stringify(tracks)};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};
const nearest=(samples,t)=>{if(!samples?.length)return{x:0,y:0,rotation:0};let best=samples[0],d=Math.abs((best.time||0)-t);for(let i=1;i<samples.length;i++){const nd=Math.abs((samples[i].time||0)-t);if(nd<d){best=samples[i];d=nd;}}return best;};
const font='Inter,Arial,Helvetica,sans-serif';
const palette=(scene)=>scene.accent==='gold'?{solid:'#f1d19a',soft:'rgba(241,209,154,.30)',glow:'rgba(241,209,154,.17)',line:'rgba(241,209,154,.42)'}:{solid:'#c8f4ff',soft:'rgba(200,244,255,.28)',glow:'rgba(125,226,255,.16)',line:'rgba(200,244,255,.40)'};
const glass=(p,strong=false)=>({background:strong?'linear-gradient(145deg,rgba(8,14,20,.58),rgba(26,34,41,.25) 48%,rgba(255,255,255,.075))':'linear-gradient(145deg,rgba(8,14,20,.36),rgba(255,255,255,.045))',border:'1px solid '+p.soft,boxShadow:'0 28px 90px rgba(0,0,0,.26),0 0 42px '+p.glow+',inset 0 1px 0 rgba(255,255,255,.20),inset 0 -1px 0 rgba(255,255,255,.035)',backdropFilter:'blur(24px) saturate(155%)',WebkitBackdropFilter:'blur(24px) saturate(155%)'});
const enterAt=(frame,start,d=.42)=>interpolate(frame,[Math.round(fps*start),Math.round(fps*(start+d))],[0,1],clamp);
const CapCard=({scene,cap,index,frame,base,p,left,top,width=275})=>{const e=enterAt(frame,.38+index*.13,.38),active=Math.floor((frame/fps)*1.35)%Math.max(1,scene.capabilities.length)===index;return <div style={{...glass(p,false),position:'absolute',left,top,width,padding:'15px 17px 14px',borderRadius:18,boxSizing:'border-box',opacity:e,transform:base+' translate3d(0,'+(12*(1-e))+'px,'+(index*9)+'px)',border:'1px solid '+(active?p.line:p.soft)}}><div style={{display:'flex',alignItems:'center',gap:11}}><div style={{width:28,height:28,borderRadius:9,border:'1px solid '+p.soft,display:'grid',placeItems:'center',fontFamily:font,fontSize:10,fontWeight:800,color:p.solid,background:active?p.glow:'rgba(255,255,255,.025)'}}>{String(index+1).padStart(2,'0')}</div><div><div style={{fontFamily:font,fontSize:18,fontWeight:620,color:'#f2f7f9',letterSpacing:-.25}}>{cap}</div><div style={{fontFamily:font,fontSize:10.5,fontWeight:700,letterSpacing:1.8,color:active?p.solid:'rgba(224,235,240,.50)',marginTop:3}}>{active?'IN CONTEXT • ACTIVE':'CONNECTED • READY'}</div></div></div></div>;};
const FlowRail=({scene,frame,base,p,vis,left,top,vertical=false})=>{const caps=scene.capabilities.length?scene.capabilities:['Business context','Evidence','Action'];const active=Math.floor((frame/fps)*1.35)%caps.length;return <div style={{position:'absolute',left,top,width:vertical?330:760,height:vertical?520:165,opacity:vis,transform:base}}><svg width="100%" height="100%" style={{position:'absolute',inset:0,overflow:'visible'}}><defs><linearGradient id={'flow-'+scene.id} x1="0" x2={vertical?'0':'1'} y1="0" y2={vertical?'1':'0'}><stop offset="0" stopColor={p.solid} stopOpacity=".08"/><stop offset=".5" stopColor={p.solid} stopOpacity=".75"/><stop offset="1" stopColor={p.solid} stopOpacity=".08"/></linearGradient></defs><path d={vertical?'M 42 42 L 42 466':'M 48 82 L 708 82'} stroke={'url(#flow-'+scene.id+')'} strokeWidth="1.6" fill="none"/><circle cx={vertical?42:48+(660*(active/Math.max(1,caps.length-1)))} cy={vertical?42+(424*(active/Math.max(1,caps.length-1))):82} r="6" fill={p.solid} style={{filter:'drop-shadow(0 0 11px '+p.solid+')'}}/></svg>{caps.map((cap,i)=>{const e=enterAt(frame,.32+i*.12,.34),x=vertical?75:Math.round(i*(640/Math.max(1,caps.length-1))),y=vertical?Math.round(i*(420/Math.max(1,caps.length-1))):20;return <div key={cap} style={{...glass(p,false),position:'absolute',left:x,top:y,width:vertical?240:205,minHeight:118,padding:'14px 14px',borderRadius:18,boxSizing:'border-box',opacity:e,transform:'translateY('+(8*(1-e))+'px)',border:'1px solid '+(i===active?p.line:p.soft)}}><div style={{fontFamily:font,fontSize:10,fontWeight:800,letterSpacing:2,color:p.solid,opacity:.88}}>STEP {String(i+1).padStart(2,'0')}</div><div style={{fontFamily:font,fontSize:17,fontWeight:640,lineHeight:1.08,color:'#f5f8fa',marginTop:8}}>{cap}</div><div style={{fontFamily:font,fontSize:10.5,fontWeight:650,letterSpacing:1.1,color:i===active?p.solid:'rgba(230,239,243,.48)',marginTop:10}}>{i===active?'STATE • PROCESSING':'STATE • CONNECTED'}</div></div>;})}</div>;};
const Evidence=({scene,frame,base,p,vis,left,top})=>{const e=enterAt(frame,.75,.5);return <div style={{...glass(p,true),position:'absolute',left,top,width:350,padding:'18px 20px',borderRadius:23,boxSizing:'border-box',opacity:vis*e,transform:base+' translate3d(0,'+(10*(1-e))+'px,38px)'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{fontFamily:font,fontSize:10.5,fontWeight:800,letterSpacing:2.5,color:p.solid}}>OPERATING EVIDENCE</div><div style={{width:8,height:8,borderRadius:99,background:p.solid,boxShadow:'0 0 18px '+p.solid}}/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginTop:14}}>{[['CONTEXT','BOUND'],['EVIDENCE','TRACEABLE'],['POLICY','APPLIED'],['ACTION','GOVERNED']].map(([a,b])=><div key={a} style={{border:'1px solid rgba(255,255,255,.075)',borderRadius:13,padding:'10px 11px',background:'rgba(255,255,255,.025)'}}><div style={{fontFamily:font,fontSize:9.5,fontWeight:750,letterSpacing:1.6,color:'rgba(227,237,241,.48)'}}>{a}</div><div style={{fontFamily:font,fontSize:12.5,fontWeight:650,color:'#edf5f7',marginTop:4}}>{b}</div></div>)}</div></div>;};
const AI=({scene,frame,base,p,vis,left,top,width=520})=>{if(!scene.ai_signal)return null;const e=enterAt(frame,1.05,.55);return <div style={{...glass(p,true),position:'absolute',left,top,width,padding:'20px 22px',borderRadius:24,boxSizing:'border-box',opacity:vis*e,transform:base+' translate3d(0,'+(12*(1-e))+'px,58px)'}}><div style={{display:'flex',alignItems:'center',gap:11}}><div style={{width:29,height:29,borderRadius:11,border:'1px solid '+p.line,display:'grid',placeItems:'center',background:p.glow,fontFamily:font,fontSize:11,fontWeight:850,color:p.solid}}>AI</div><div><div style={{fontFamily:font,fontSize:10.5,fontWeight:800,letterSpacing:2.5,color:p.solid}}>AVANTIQO INTELLIGENCE</div><div style={{fontFamily:font,fontSize:10,color:'rgba(228,239,243,.48)',letterSpacing:1.5,marginTop:2}}>CONTEXT + EVIDENCE + POLICY</div></div></div><div style={{fontFamily:font,fontSize:18,fontWeight:570,lineHeight:1.30,color:'#f1f6f8',marginTop:15}}>{scene.ai_signal}</div><div style={{display:'flex',gap:8,marginTop:14}}>{['OBSERVE','REASON','NEXT ACTION'].map((v,i)=><div key={v} style={{padding:'7px 9px',borderRadius:10,border:'1px solid rgba(255,255,255,.08)',background:i===Math.floor((frame/fps)*1.2)%3?p.glow:'rgba(255,255,255,.025)',fontFamily:font,fontSize:9,fontWeight:800,letterSpacing:1.2,color:i===Math.floor((frame/fps)*1.2)%3?p.solid:'rgba(230,239,243,.50)'}}>{v}</div>)}</div></div>;};
const Context=({scene,frame,base,p,vis,left,top,width=430})=>{const e=enterAt(frame,.08,.48);return <div style={{...glass(p,true),position:'absolute',left,top,width,padding:'20px 23px 19px',borderRadius:23,boxSizing:'border-box',opacity:vis*e,transform:base+' translate3d(0,'+(10*(1-e))+'px,72px)'}}><div style={{fontFamily:font,fontSize:10.5,fontWeight:850,letterSpacing:3.2,color:p.solid}}>{scene.kicker}</div><div style={{fontFamily:font,fontSize:31,fontWeight:680,letterSpacing:-.9,color:'#f8fbfc',lineHeight:1.04,marginTop:7}}>{scene.domain}</div><div style={{display:'flex',alignItems:'center',gap:8,marginTop:13}}><div style={{width:5,height:5,borderRadius:99,background:p.solid}}/><div style={{fontFamily:font,fontSize:10,fontWeight:720,letterSpacing:1.7,color:'rgba(230,239,243,.57)'}}>ONE BUSINESS CONTEXT • TRACEABLE</div></div></div>;};
const Network=({scene,frame,p,vis})=>{const t=frame/fps;const left=scene.side==='left';const ox=left?520:1400,dir=left?1:-1;return <svg width={width} height={height} style={{position:'absolute',inset:0,opacity:.58*vis,pointerEvents:'none'}}>{[0,1,2].map(i=><path key={'p'+i} d={'M '+ox+' '+(330+i*122)+' C '+(ox+dir*(180+i*15))+' '+(350+i*105)+', '+(ox+dir*(260+i*22))+' '+(480+i*88)+', '+(ox+dir*(385+i*34))+' '+(520+i*70)} fill="none" stroke={p.line} strokeWidth={i===1?1.5:1} strokeDasharray={i===1?'0':'5 9'} />)}{[0,1,2,3,4,5].map(i=><circle key={'c'+i} cx={ox+dir*(65+i*62)+Math.sin(t*1.05+i)*6} cy={340+i*77+Math.cos(t*.9+i)*5} r={i%2?3.5:5} fill={p.solid} opacity={.28+i*.07}/>)}</svg>;};
const Objects=({scene,frame})=>{const t=frame/fps,s=nearest(tracks[scene.id]||[],t),frames=Math.max(1,Math.round(scene.duration_seconds*fps));const enter=interpolate(frame,[0,Math.round(fps*.42)],[0,1],clamp),exit=interpolate(frame,[Math.max(0,frames-Math.round(fps*.34)),frames],[1,0],clamp),vis=Math.min(enter,exit),p=palette(scene),left=scene.side==='left';const ax=Math.max(-22,Math.min(22,-s.x*.18)),ay=Math.max(-13,Math.min(13,-s.y*.14)),ar=Math.max(-1.15,Math.min(1.15,-s.rotation*.11));const base='perspective(1800px) translate3d('+ax+'px,'+(ay+Math.sin(t*.9)*2.5)+'px,0) rotateY('+((left?4.8:-4.8)+ar)+'deg) rotateX(-.7deg)';const mode=scene.mode%4;if(mode===0)return <><Network scene={scene} frame={frame} p={p} vis={vis}/><Context scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?90:1390} top={120}/><FlowRail scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?150:1010} top={360}/><Evidence scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?980:170} top={165}/><AI scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?1040:160} top={675}/></>;if(mode===1)return <><Network scene={scene} frame={frame} p={p} vis={vis}/><Context scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?120:1370} top={135} width={430}/><FlowRail scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?1380:210} top={305} vertical={true}/><Evidence scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?620:950} top={640}/><AI scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?680:660} top={205} width={560}/></>;if(mode===2)return <><Network scene={scene} frame={frame} p={p} vis={vis}/><Context scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?105:1380} top={700}/><FlowRail scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?625:530} top={150} vertical={true}/><Evidence scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?1030:245} top={600}/><AI scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?990:190} top={180}/></>;return <><Network scene={scene} frame={frame} p={p} vis={vis}/><Context scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?110:1380} top={115}/><FlowRail scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?160:1000} top={690}/><Evidence scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?1080:160} top={430}/><AI scene={scene} frame={frame} base={base} p={p} vis={vis} left={left?610:730} top={235}/></>;};
const Scene=({scene,index})=>{const frame=useCurrentFrame(),frames=Math.max(1,Math.round(scene.duration_seconds*fps));const fi=interpolate(frame,[0,Math.round(fps*.18)],[0,1],clamp),fo=interpolate(frame,[Math.max(0,frames-Math.round(fps*.22)),frames],[1,0],clamp);return <AbsoluteFill style={{backgroundColor:'#020406',opacity:Math.min(fi,fo),overflow:'hidden'}}><OffthreadVideo src={staticFile('scene-'+index+'.mp4')} startFrom={Math.round(scene.source_in_seconds*fps)} volume={0} style={{width:'100%',height:'100%',objectFit:'cover'}}/><AbsoluteFill style={{background:'radial-gradient(circle at 50% 47%,transparent 35%,rgba(0,0,0,.035) 67%,rgba(0,0,0,.25) 100%)'}}/><Objects scene={scene} frame={frame}/></AbsoluteFill>;};
const Main=()=>{let cursor=0;return <AbsoluteFill style={{backgroundColor:'#020406'}}>{scenes.map((scene,index)=>{const d=Math.max(1,Math.round(scene.duration_seconds*fps)),from=cursor;cursor+=d;return <Sequence key={scene.id} from={from} durationInFrames={d}><Scene scene={scene} index={index}/></Sequence>;})}</AbsoluteFill>;};
const total=scenes.reduce((sum,s)=>sum+Math.max(1,Math.round(s.duration_seconds*fps)),0);
const Root=()=> <Composition id="SpatialProductTwin" component={Main} durationInFrames={total} fps={fps} width={width} height={height}/>;
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
  await renderMedia({composition,serveUrl,codec:'h264',outputLocation:${JSON.stringify(outputPath)},pixelFormat:'yuv420p',crf:14,browserExecutable,chromiumOptions,concurrency:1});
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
  const base = `/tmp/avantiqo-spatial-product-twin-v8-${identity}`;
  const publicDir = `${base}/public`;
  const entryPath = `${base}/index.jsx`;
  const scriptPath = `${base}/render.cjs`;
  const outputPath = `${base}/proof.mp4`;
  const tracks = {};
  const buffers = [];

  for (const scene of normalized) {
    const [buffer, tracking] = await Promise.all([
      sourceBuffer(organization_id, scene.source_reference),
      CreativeOpenCVCameraTrackRuntime.execute({
        organization_id,
        project,
        source_reference: scene.source_reference,
        sample_fps: 4,
        max_frames: 140,
      }).catch(() => ({ result: { samples: [] } })),
    ]);
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
      path: `${publicDir}/scene-${index}.mp4`,
      content: buffer,
    })));
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: entryPath,
      content: entrySource({ scenes: normalized, tracks, fps: safeFps, width: safeWidth, height: safeHeight }),
    });
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: scriptPath,
      content: renderScript({ entryPath, publicDir, outputPath, browserExecutable: prepared.browserExecutable }),
    });
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
    const trackingProven = normalized.every((scene) => (tracks[scene.id] || []).length > 0);
    return {
      contract: CONTRACT,
      buffer,
      mime_type: "video/mp4",
      width: safeWidth,
      height: safeHeight,
      fps: safeFps,
      duration_seconds: normalized.reduce((sum, scene) => sum + scene.duration_seconds, 0),
      spatial_glass_tracking_proven: trackingProven,
      visual_language: "SPATIAL_OPERATING_OBJECTS_V1",
      generated_product_text: false,
      full_screen_ui_ratio: 0,
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
