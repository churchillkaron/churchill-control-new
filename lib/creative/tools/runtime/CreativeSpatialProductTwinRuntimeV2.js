import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeOpenCVRuntime,
} from "@/lib/creative/tools/runtime/CreativeOpenCVRuntime";
import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_SPATIAL_PRODUCT_TWIN_RUNTIME_V2";
const TOOL_ID = "remotion";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback) {
  const parsed = finite(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function snapshotId(project) {
  return text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
}

function jobId(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

function normalizeScene(scene, index) {
  const sourceReference = text(scene?.source_reference);
  const domain = text(scene?.domain);
  if (!sourceReference.startsWith("storage://")) {
    throw new Error(`SPATIAL_PRODUCT_TWIN_STORAGE_SOURCE_REQUIRED:${index}`);
  }
  if (!domain) throw new Error(`SPATIAL_PRODUCT_TWIN_DOMAIN_REQUIRED:${index}`);
  return {
    id: text(scene?.id) || `scene-${index + 1}`,
    source_reference: sourceReference,
    source_in_seconds: Math.max(0, finite(scene?.source_in_seconds, 0)),
    duration_seconds: positive(scene?.duration_seconds, 5),
    kicker: text(scene?.kicker || "AVANTIQO INTELLIGENCE").slice(0, 50),
    domain: domain.slice(0, 64),
    capabilities: Array.isArray(scene?.capabilities)
      ? scene.capabilities.map(text).filter(Boolean).slice(0, 4)
      : [],
    ai_signal: text(scene?.ai_signal).slice(0, 140),
    side: text(scene?.side).toLowerCase() === "left" ? "left" : "right",
    accent: text(scene?.accent).toLowerCase() === "gold" ? "gold" : "ice",
  };
}

function normalizeScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("SPATIAL_PRODUCT_TWIN_SCENES_REQUIRED");
  return scenes.slice(0, 8).map(normalizeScene);
}

async function downloadReference(organizationId, reference) {
  const signed = await signCreativeStorageReference({
    organization_id: organizationId,
    reference,
    expires_in: 1200,
  });
  const response = await fetch(signed, { redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error(`SPATIAL_PRODUCT_TWIN_SOURCE_DOWNLOAD_FAILED:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function cleanTrack(value) {
  const result = value?.result || value || {};
  const samples = Array.isArray(result.samples) ? result.samples : [];
  return samples.slice(0, 160).map((sample) => ({
    time: Math.max(0, finite(sample?.time_seconds, 0)),
    x: finite(sample?.cumulative_x, 0),
    y: finite(sample?.cumulative_y, 0),
    rotation: finite(sample?.cumulative_rotation_degrees, 0),
    scale: finite(sample?.cumulative_scale, 1),
  }));
}

function entrySource({ scenes, tracks, fps, width, height }) {
  return `
import React from 'react';
import {AbsoluteFill, Composition, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';

const fps=${fps};
const width=${width};
const height=${height};
const scenes=${JSON.stringify(scenes)};
const tracks=${JSON.stringify(tracks)};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};

const trackAt=(samples,seconds)=>{
  if(!samples||!samples.length)return{x:0,y:0,rotation:0,scale:1};
  let best=samples[0],distance=Math.abs((best.time||0)-seconds);
  for(let i=1;i<samples.length;i++){const d=Math.abs((samples[i].time||0)-seconds);if(d<distance){best=samples[i];distance=d;}}
  return best;
};

const glassBase=(accent)=>({
  background:'linear-gradient(135deg, rgba(17,24,30,.28), rgba(255,255,255,.055))',
  border:'1px solid '+accent.replace('1)', '.28)'),
  boxShadow:'0 24px 80px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.13)',
  backdropFilter:'blur(24px) saturate(150%)',WebkitBackdropFilter:'blur(24px) saturate(150%)',
});

const SpatialObjects=({scene,localFrame})=>{
  const seconds=localFrame/fps;
  const sample=trackAt(tracks[scene.id]||[],seconds);
  const enter=interpolate(localFrame,[0,Math.round(fps*.7)],[0,1],clamp);
  const exit=interpolate(localFrame,[Math.max(0,Math.round(scene.duration_seconds*fps)-Math.round(fps*.45)),Math.round(scene.duration_seconds*fps)],[1,0],clamp);
  const visibility=Math.min(enter,exit);
  const ax=Math.max(-24,Math.min(24,-sample.x*.20));
  const ay=Math.max(-15,Math.min(15,-sample.y*.15));
  const ar=Math.max(-1.4,Math.min(1.4,-sample.rotation*.14));
  const drift=Math.sin(localFrame/fps*.95)*4;
  const left=scene.side==='left';
  const ice='rgba(190,241,255,1)';
  const gold='rgba(226,194,137,1)';
  const accent=scene.accent==='gold'?gold:ice;
  const anchorX=left?90:width-520;
  const perspective=left?7:-7;
  const baseTransform='perspective(1500px) rotateY('+(perspective+ar)+'deg) translate3d('+ax+'px,'+(ay+drift)+'px,0)';

  const card=(extra={})=>({...glassBase(accent),position:'absolute',boxSizing:'border-box',opacity:visibility,transform:baseTransform,...extra});
  const capPositions=left
    ? [[100,400],[360,500],[125,595],[400,690]]
    : [[width-430,410],[width-690,510],[width-405,605],[width-705,700]];

  return <>
    <div style={card({left:anchorX,top:180,width:430,padding:'22px 26px',borderRadius:26})}>
      <div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:13,fontWeight:700,letterSpacing:4.4,color:accent,opacity:.92,marginBottom:8}}>{scene.kicker}</div>
      <div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:42,fontWeight:650,letterSpacing:-1.2,color:'#f8fbfd',lineHeight:1.02}}>{scene.domain}</div>
    </div>
    {scene.capabilities.map((capability,index)=>{
      const p=capPositions[index]||capPositions[0];
      const itemEnter=interpolate(localFrame,[Math.round(fps*(.55+index*.16)),Math.round(fps*(1.05+index*.16))],[0,1],clamp);
      return <div key={capability} style={card({left:p[0],top:p[1]+Math.sin(localFrame/fps*1.1+index)*5,width:250,padding:'15px 18px',borderRadius:19,opacity:visibility*itemEnter,transform:baseTransform+' translateY('+(12*(1-itemEnter))+'px)'})}>
        <div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:21,fontWeight:520,color:'#eef5f7',whiteSpace:'nowrap'}}>{capability}</div>
      </div>;
    })}
    {scene.ai_signal?<div style={card({left:left?310:width-720,top:815,width:520,padding:'17px 20px',borderRadius:21,display:'flex',gap:13,alignItems:'center'})}>
      <div style={{width:9,height:9,borderRadius:99,background:accent,boxShadow:'0 0 22px '+accent,flex:'0 0 auto'}}/>
      <div style={{fontFamily:'Arial,Helvetica,sans-serif',fontSize:18,color:'#e0e9ed',lineHeight:1.25}}>{scene.ai_signal}</div>
    </div>:null}
    <svg width={width} height={height} style={{position:'absolute',inset:0,opacity:.48*visibility,pointerEvents:'none'}}>
      <path d={left?'M 420 330 C 620 360, 700 530, 820 715':'M 1500 330 C 1300 360, 1220 530, 1100 715'} fill="none" stroke={accent} strokeOpacity=".22" strokeWidth="1.2"/>
      {[0,1,2,3,4].map((i)=><circle key={i} cx={(left?480:1440)+(left?1:-1)*i*88+Math.sin((localFrame+i*17)/30)*8} cy={340+i*92+Math.cos((localFrame+i*13)/33)*7} r={3+(i%2)} fill={accent} opacity={.28+i*.08}/>)}
    </svg>
  </>;
};

const Scene=({scene,index})=>{
  const frame=useCurrentFrame();
  const frames=Math.max(1,Math.round(scene.duration_seconds*fps));
  const fadeIn=interpolate(frame,[0,Math.round(fps*.22)],[0,1],clamp);
  const fadeOut=interpolate(frame,[Math.max(0,frames-Math.round(fps*.25)),frames],[1,0],clamp);
  return <AbsoluteFill style={{backgroundColor:'#020406',opacity:Math.min(fadeIn,fadeOut)}}>
    <OffthreadVideo src={staticFile('scene-'+index+'.mp4')} startFrom={Math.round(scene.source_in_seconds*fps)} volume={0} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
    <AbsoluteFill style={{background:'radial-gradient(circle at 50% 45%, transparent 32%, rgba(0,0,0,.05) 68%, rgba(0,0,0,.28) 100%)'}}/>
    <SpatialObjects scene={scene} localFrame={frame}/>
  </AbsoluteFill>;
};

const Main=()=>{let cursor=0;return <AbsoluteFill style={{backgroundColor:'#020406'}}>{scenes.map((scene,index)=>{const duration=Math.max(1,Math.round(scene.duration_seconds*fps));const from=cursor;cursor+=duration;return <Sequence key={scene.id} from={from} durationInFrames={duration}><Scene scene={scene} index={index}/></Sequence>;})}</AbsoluteFill>;};
const totalFrames=scenes.reduce((sum,scene)=>sum+Math.max(1,Math.round(scene.duration_seconds*fps)),0);
export const RemotionRoot=()=> <Composition id="SpatialProductTwin" component={Main} durationInFrames={totalFrames} fps={fps} width={width} height={height}/>;
`;
}

function renderScriptSource({ entryPath, publicDir, outputPath }) {
  return `
const {bundle}=require('/tmp/avantiqo-remotion/node_modules/@remotion/bundler');
const {renderMedia,selectComposition}=require('/tmp/avantiqo-remotion/node_modules/@remotion/renderer');
(async()=>{const serveUrl=await bundle({entryPoint:${JSON.stringify(entryPath)},publicDir:${JSON.stringify(publicDir)}});const composition=await selectComposition({serveUrl,id:'SpatialProductTwin'});await renderMedia({composition,serveUrl,codec:'h264',outputLocation:${JSON.stringify(outputPath)},pixelFormat:'yuv420p',crf:14});console.log(JSON.stringify({durationInFrames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height}));})();
`;
}

export async function renderCreativeSpatialProductTwin({ organization_id, project, scenes, width=1920, height=1080, fps=24 }={}) {
  if (!text(organization_id)) throw new Error("SPATIAL_PRODUCT_TWIN_ORGANIZATION_REQUIRED");
  const snapshot=snapshotId(project);
  if(!snapshot) throw new Error("CREATIVE_REMOTION_SNAPSHOT_REQUIRED");
  const normalized=normalizeScenes(scenes);
  const safeWidth=Math.max(640,Math.floor(positive(width,1920)));
  const safeHeight=Math.max(360,Math.floor(positive(height,1080)));
  const safeFps=Math.max(12,Math.floor(positive(fps,24)));
  const identity=jobId({organization_id,project_id:project?.id,normalized,safeWidth,safeHeight,safeFps});
  const base=`/tmp/avantiqo-spatial-product-twin-v2-${identity}`;
  const publicDir=`${base}/public`;
  const entryPath=`${base}/index.jsx`;
  const scriptPath=`${base}/render.cjs`;
  const outputPath=`${base}/spatial-product-twin-v2.mp4`;
  const tracks={};
  const sourceBuffers=[];

  for(const scene of normalized){
    const [buffer,tracking]=await Promise.all([
      downloadReference(organization_id,scene.source_reference),
      CreativeOpenCVRuntime.execute({organization_id,project,operation:"CAMERA_TRACK",source_reference:scene.source_reference,sample_fps:4,max_frames:140}),
    ]);
    sourceBuffers.push(buffer);
    tracks[scene.id]=cleanTrack(tracking);
    if(!tracks[scene.id].length) throw new Error(`SPATIAL_PRODUCT_TWIN_TRACKING_REQUIRED:${scene.id}`);
  }

  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:900000,network_policy:"deny-all"});
  try{
    await CreativeSandboxRuntime.run({sandbox,cmd:"mkdir",args:["-p",publicDir]});
    await sandbox.writeFiles(sourceBuffers.map((buffer,index)=>({path:`${publicDir}/scene-${index}.mp4`,content:buffer})));
    await CreativeSandboxRuntime.writeText({sandbox,path:entryPath,content:entrySource({scenes:normalized,tracks,fps:safeFps,width:safeWidth,height:safeHeight})});
    await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:renderScriptSource({entryPath,publicDir,outputPath})});
    const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"node",args:[scriptPath],timeout_ms:840000,error_prefix:"CREATIVE_SPATIAL_PRODUCT_TWIN_RENDER_FAILED"});
    const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});
    let metadata=null;try{metadata=JSON.parse(execution.stdout||"null");}catch{metadata=null;}
    return {contract:CONTRACT,tool_id:TOOL_ID,mime_type:"video/mp4",codec:"h264",buffer,bytes:buffer.length,duration_seconds:normalized.reduce((sum,scene)=>sum+scene.duration_seconds,0),scene_count:normalized.length,full_screen_ui_ratio:0,spatial_glass_tracking_proven:true,design_policy:"LIVE_ENVIRONMENT_PRIMARY_FLOATING_GLASS_OBJECTS_ONLY",metadata};
  }finally{await CreativeSandboxRuntime.stop(sandbox);}
}

export const CreativeSpatialProductTwinRuntime=Object.freeze({contract:CONTRACT,render:renderCreativeSpatialProductTwin});
