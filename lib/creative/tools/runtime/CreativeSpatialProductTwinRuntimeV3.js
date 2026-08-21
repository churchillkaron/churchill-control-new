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

const CONTRACT = "CREATIVE_SPATIAL_PRODUCT_TWIN_RUNTIME_V3";
const TOOL_ID = "remotion";

const text = (v) => String(v ?? "").trim();
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const pos = (v, d) => num(v, d) > 0 ? num(v, d) : d;
const snapshotId = (project) => text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
const jobId = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 20);

function normalizeScene(scene, index) {
  const source = text(scene?.source_reference);
  const domain = text(scene?.domain);
  if (!source.startsWith("storage://")) throw new Error(`SPATIAL_PRODUCT_TWIN_STORAGE_SOURCE_REQUIRED:${index}`);
  if (!domain) throw new Error(`SPATIAL_PRODUCT_TWIN_DOMAIN_REQUIRED:${index}`);
  return {
    id: text(scene?.id) || `scene-${index + 1}`,
    source_reference: source,
    source_in_seconds: Math.max(0, num(scene?.source_in_seconds, 0)),
    duration_seconds: pos(scene?.duration_seconds, 5),
    kicker: text(scene?.kicker || "AVANTIQO INTELLIGENCE").slice(0, 50),
    domain: domain.slice(0, 64),
    capabilities: Array.isArray(scene?.capabilities) ? scene.capabilities.map(text).filter(Boolean).slice(0, 4) : [],
    ai_signal: text(scene?.ai_signal).slice(0, 140),
    side: text(scene?.side).toLowerCase() === "left" ? "left" : "right",
    accent: text(scene?.accent).toLowerCase() === "gold" ? "gold" : "ice",
  };
}

function normalizeScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("SPATIAL_PRODUCT_TWIN_SCENES_REQUIRED");
  return scenes.slice(0, 8).map(normalizeScene);
}

async function sourceBuffer(organizationId, reference) {
  const signed = await signCreativeStorageReference({ organization_id: organizationId, reference, expires_in: 1200 });
  const response = await fetch(signed, { redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error(`SPATIAL_PRODUCT_TWIN_SOURCE_DOWNLOAD_FAILED:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function trackSamples(value) {
  const samples = Array.isArray(value?.result?.samples) ? value.result.samples : [];
  return samples.slice(0, 180).map((s) => ({
    time: Math.max(0, num(s.time_seconds, 0)),
    x: num(s.cumulative_x, 0),
    y: num(s.cumulative_y, 0),
    rotation: num(s.cumulative_rotation_degrees, 0),
  }));
}

function entrySource({ scenes, tracks, fps, width, height }) {
  return `
import React from 'react';
import {AbsoluteFill,Composition,interpolate,OffthreadVideo,Sequence,staticFile,useCurrentFrame} from 'remotion';
const fps=${fps},width=${width},height=${height};
const scenes=${JSON.stringify(scenes)},tracks=${JSON.stringify(tracks)};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};
const nearest=(samples,t)=>{if(!samples?.length)return{x:0,y:0,rotation:0};let best=samples[0],d=Math.abs((best.time||0)-t);for(let i=1;i<samples.length;i++){const nd=Math.abs((samples[i].time||0)-t);if(nd<d){best=samples[i];d=nd;}}return best;};
const glass=(accent)=>({background:'linear-gradient(135deg,rgba(13,19,25,.30),rgba(255,255,255,.055))',border:'1px solid '+accent,boxShadow:'0 24px 90px rgba(0,0,0,.30),inset 0 1px 0 rgba(255,255,255,.14)',backdropFilter:'blur(24px) saturate(155%)',WebkitBackdropFilter:'blur(24px) saturate(155%)'});

const Objects=({scene,frame})=>{
 const t=frame/fps,s=nearest(tracks[scene.id]||[],t),frames=Math.round(scene.duration_seconds*fps);
 const enter=interpolate(frame,[0,Math.round(fps*.65)],[0,1],clamp),exit=interpolate(frame,[Math.max(0,frames-Math.round(fps*.4)),frames],[1,0],clamp),vis=Math.min(enter,exit);
 const left=scene.side==='left',solid=scene.accent==='gold'?'rgba(227,195,139,.92)':'rgba(190,241,255,.92)',edge=scene.accent==='gold'?'rgba(227,195,139,.24)':'rgba(190,241,255,.24)';
 const ax=Math.max(-24,Math.min(24,-s.x*.20)),ay=Math.max(-15,Math.min(15,-s.y*.15)),ar=Math.max(-1.3,Math.min(1.3,-s.rotation*.14));
 const base='perspective(1500px) translate3d('+ax+'px,'+(ay+Math.sin(t)*4)+'px,0) rotateY('+((left?7:-7)+ar)+'deg)';
 const style=(extra={})=>({...glass(edge),position:'absolute',boxSizing:'border-box',opacity:vis,transform:base,...extra});
 const titleX=left?88:width-520;
 const positions=left?[[100,390],[360,485],[115,580],[390,675]]:[[width-430,390],[width-690,485],[width-405,580],[width-705,675]];
 return <>
  <div style={style({left:titleX,top:175,width:430,padding:'22px 26px',borderRadius:25})}><div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:13,fontWeight:700,letterSpacing:4.2,color:solid,marginBottom:8}}>{scene.kicker}</div><div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:42,fontWeight:650,letterSpacing:-1.2,color:'#f7fbfd',lineHeight:1.02}}>{scene.domain}</div></div>
  {scene.capabilities.map((cap,i)=>{const p=positions[i]||positions[0],iv=interpolate(frame,[Math.round(fps*(.45+i*.13)),Math.round(fps*(.95+i*.13))],[0,1],clamp);return <div key={cap} style={style({left:p[0],top:p[1]+Math.sin(t*1.05+i)*5,width:245,padding:'14px 17px',borderRadius:18,opacity:vis*iv,transform:base+' translateY('+(10*(1-iv))+'px)'})}><div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:20,fontWeight:520,color:'#eef5f7',whiteSpace:'nowrap'}}>{cap}</div></div>;})}
  {scene.ai_signal?<div style={style({left:left?300:width-720,top:805,width:520,padding:'16px 19px',borderRadius:20,display:'flex',alignItems:'center',gap:12})}><div style={{width:9,height:9,borderRadius:99,background:solid,boxShadow:'0 0 22px '+solid}}/><div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:18,color:'#e2eaee',lineHeight:1.25}}>{scene.ai_signal}</div></div>:null}
  <svg width={width} height={height} style={{position:'absolute',inset:0,opacity:.46*vis,pointerEvents:'none'}}><path d={left?'M 440 320 C 610 390 690 550 800 730':'M 1480 320 C 1310 390 1230 550 1120 730'} fill="none" stroke={solid} strokeOpacity=".22" strokeWidth="1.2"/>{[0,1,2,3,4].map(i=><circle key={i} cx={(left?500:1420)+(left?1:-1)*i*85+Math.sin((frame+i*17)/30)*8} cy={335+i*90+Math.cos((frame+i*11)/31)*7} r={3+(i%2)} fill={solid} opacity={.28+i*.08}/>)}</svg>
 </>;
};

const Scene=({scene,index})=>{const frame=useCurrentFrame(),frames=Math.max(1,Math.round(scene.duration_seconds*fps));const fi=interpolate(frame,[0,Math.round(fps*.2)],[0,1],clamp),fo=interpolate(frame,[Math.max(0,frames-Math.round(fps*.22)),frames],[1,0],clamp);return <AbsoluteFill style={{backgroundColor:'#020406',opacity:Math.min(fi,fo)}}><OffthreadVideo src={staticFile('scene-'+index+'.mp4')} startFrom={Math.round(scene.source_in_seconds*fps)} volume={0} style={{width:'100%',height:'100%',objectFit:'cover'}}/><AbsoluteFill style={{background:'radial-gradient(circle at 50% 46%,transparent 34%,rgba(0,0,0,.04) 67%,rgba(0,0,0,.26) 100%)'}}/><Objects scene={scene} frame={frame}/></AbsoluteFill>;};
const Main=()=>{let cursor=0;return <AbsoluteFill style={{backgroundColor:'#020406'}}>{scenes.map((scene,index)=>{const d=Math.max(1,Math.round(scene.duration_seconds*fps)),from=cursor;cursor+=d;return <Sequence key={scene.id} from={from} durationInFrames={d}><Scene scene={scene} index={index}/></Sequence>;})}</AbsoluteFill>;};
const total=scenes.reduce((sum,s)=>sum+Math.max(1,Math.round(s.duration_seconds*fps)),0);
export const RemotionRoot=()=> <Composition id="SpatialProductTwin" component={Main} durationInFrames={total} fps={fps} width={width} height={height}/>;
`;
}

function renderScript({ entryPath, publicDir, outputPath }) {
  return `
const {bundle}=require('/tmp/avantiqo-remotion/node_modules/@remotion/bundler');
const {renderMedia,selectComposition}=require('/tmp/avantiqo-remotion/node_modules/@remotion/renderer');
(async()=>{const serveUrl=await bundle({entryPoint:${JSON.stringify(entryPath)},publicDir:${JSON.stringify(publicDir)}});const composition=await selectComposition({serveUrl,id:'SpatialProductTwin'});await renderMedia({composition,serveUrl,codec:'h264',outputLocation:${JSON.stringify(outputPath)},pixelFormat:'yuv420p',crf:14});console.log(JSON.stringify({durationInFrames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height}));})();
`;
}

export async function renderCreativeSpatialProductTwin({ organization_id, project, scenes, width=1920, height=1080, fps=24 }={}) {
  if (!text(organization_id)) throw new Error("SPATIAL_PRODUCT_TWIN_ORGANIZATION_REQUIRED");
  const snapshot=snapshotId(project); if(!snapshot) throw new Error("CREATIVE_REMOTION_SNAPSHOT_REQUIRED");
  const normalized=normalizeScenes(scenes),safeWidth=Math.max(640,Math.floor(pos(width,1920))),safeHeight=Math.max(360,Math.floor(pos(height,1080))),safeFps=Math.max(12,Math.floor(pos(fps,24)));
  const identity=jobId({organization_id,project_id:project?.id,normalized,safeWidth,safeHeight,safeFps}),base=`/tmp/avantiqo-spatial-product-twin-v3-${identity}`,publicDir=`${base}/public`,entryPath=`${base}/index.jsx`,scriptPath=`${base}/render.cjs`,outputPath=`${base}/proof.mp4`;
  const tracks={},buffers=[];
  for(const scene of normalized){
    const [buffer,tracking]=await Promise.all([
      sourceBuffer(organization_id,scene.source_reference),
      CreativeOpenCVCameraTrackRuntime.execute({organization_id,project,source_reference:scene.source_reference,sample_fps:4,max_frames:140}),
    ]);
    const samples=trackSamples(tracking); if(!samples.length) throw new Error(`SPATIAL_PRODUCT_TWIN_TRACKING_REQUIRED:${scene.id}`);
    buffers.push(buffer); tracks[scene.id]=samples;
  }
  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:900000,network_policy:"deny-all"});
  try{
    await CreativeSandboxRuntime.run({sandbox,cmd:"mkdir",args:["-p",publicDir]});
    await sandbox.writeFiles(buffers.map((buffer,index)=>({path:`${publicDir}/scene-${index}.mp4`,content:buffer})));
    await CreativeSandboxRuntime.writeText({sandbox,path:entryPath,content:entrySource({scenes:normalized,tracks,fps:safeFps,width:safeWidth,height:safeHeight})});
    await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:renderScript({entryPath,publicDir,outputPath})});
    const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"node",args:[scriptPath],timeout_ms:840000,error_prefix:"CREATIVE_SPATIAL_PRODUCT_TWIN_RENDER_FAILED"});
    const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});
    let metadata=null;try{metadata=JSON.parse(execution.stdout||"null");}catch{metadata=null;}
    return {contract:CONTRACT,tool_id:TOOL_ID,mime_type:"video/mp4",codec:"h264",buffer,bytes:buffer.length,duration_seconds:normalized.reduce((sum,s)=>sum+s.duration_seconds,0),scene_count:normalized.length,full_screen_ui_ratio:0,spatial_glass_tracking_proven:true,design_policy:"LIVE_ENVIRONMENT_PRIMARY_FLOATING_GLASS_OBJECTS_ONLY",metadata};
  }finally{await CreativeSandboxRuntime.stop(sandbox);}
}

export const CreativeSpatialProductTwinRuntime=Object.freeze({contract:CONTRACT,render:renderCreativeSpatialProductTwin});
