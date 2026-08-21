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

const CONTRACT = "CREATIVE_SPATIAL_PRODUCT_TWIN_RUNTIME_V1";
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
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
}

function normalizeScene(scene, index) {
  const capabilities = Array.isArray(scene?.capabilities)
    ? scene.capabilities.map(text).filter(Boolean).slice(0, 4)
    : [];
  if (!text(scene?.source_reference).startsWith("storage://")) {
    throw new Error(`SPATIAL_PRODUCT_TWIN_STORAGE_SOURCE_REQUIRED:${index}`);
  }
  if (!text(scene?.domain)) {
    throw new Error(`SPATIAL_PRODUCT_TWIN_DOMAIN_REQUIRED:${index}`);
  }
  return {
    id: text(scene?.id) || `scene-${index + 1}`,
    source_reference: text(scene.source_reference),
    duration_seconds: positive(scene?.duration_seconds, 5),
    source_in_seconds: Math.max(0, finite(scene?.source_in_seconds, 0)),
    domain: text(scene.domain).slice(0, 60),
    kicker: text(scene?.kicker || "AVANTIQO").slice(0, 48),
    capabilities,
    ai_signal: text(scene?.ai_signal).slice(0, 120),
    side: text(scene?.side).toLowerCase() === "left" ? "left" : "right",
    accent: text(scene?.accent).toLowerCase() === "gold" ? "gold" : "ice",
  };
}

function normalizeScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length) {
    throw new Error("SPATIAL_PRODUCT_TWIN_SCENES_REQUIRED");
  }
  return scenes.slice(0, 8).map(normalizeScene);
}

async function downloadReference(organizationId, reference) {
  const signed = await signCreativeStorageReference({
    organization_id: organizationId,
    reference,
    expires_in: 1200,
  });
  const response = await fetch(signed, { redirect: "follow", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`SPATIAL_PRODUCT_TWIN_SOURCE_DOWNLOAD_FAILED:${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function cleanTrack(result) {
  const samples = Array.isArray(result?.samples) ? result.samples : [];
  return samples.slice(0, 120).map((sample) => ({
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
import {
  AbsoluteFill,
  Composition,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const fps = ${fps};
const width = ${width};
const height = ${height};
const scenes = ${JSON.stringify(scenes)};
const tracks = ${JSON.stringify(tracks)};

const clamp = {extrapolateLeft:'clamp', extrapolateRight:'clamp'};

const trackAt = (samples, seconds) => {
  if (!samples || !samples.length) return {x:0,y:0,rotation:0,scale:1};
  let best = samples[0];
  let distance = Math.abs((best.time || 0) - seconds);
  for (let i = 1; i < samples.length; i++) {
    const nextDistance = Math.abs((samples[i].time || 0) - seconds);
    if (nextDistance < distance) { best = samples[i]; distance = nextDistance; }
  }
  return best;
};

const GlassCard = ({scene, localFrame}) => {
  const seconds = localFrame / fps;
  const sample = trackAt(tracks[scene.id] || [], seconds);
  const enter = interpolate(localFrame, [0, Math.round(fps * .8)], [0, 1], clamp);
  const breathe = Math.sin(localFrame / fps * 1.15) * 4;
  const anchoredX = Math.max(-22, Math.min(22, -sample.x * .22));
  const anchoredY = Math.max(-14, Math.min(14, -sample.y * .18));
  const anchoredRot = Math.max(-1.2, Math.min(1.2, -sample.rotation * .12));
  const isLeft = scene.side === 'left';
  const accent = scene.accent === 'gold' ? '#e3c48c' : '#b9efff';
  const accentSoft = scene.accent === 'gold' ? 'rgba(227,196,140,.22)' : 'rgba(185,239,255,.20)';
  const x = isLeft ? 92 : 1170;
  const perspective = isLeft ? 8 : -8;
  const translate = 34 * (1 - enter) * (isLeft ? -1 : 1);

  return <>
    <div style={{
      position:'absolute', left:x + anchoredX, top:178 + anchoredY + breathe,
      width:620, minHeight:510, padding:'34px 38px 32px', boxSizing:'border-box',
      borderRadius:34,
      background:'linear-gradient(135deg, rgba(12,18,24,.34), rgba(28,33,39,.16) 48%, rgba(255,255,255,.035))',
      border:'1px solid ' + accentSoft,
      boxShadow:'0 34px 100px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.13), inset 0 -1px 0 rgba(255,255,255,.035)',
      backdropFilter:'blur(28px) saturate(145%)', WebkitBackdropFilter:'blur(28px) saturate(145%)',
      transformOrigin: isLeft ? 'left center' : 'right center',
      transform:'perspective(1500px) translate3d(' + translate + 'px,0,0) rotateY(' + (perspective + anchoredRot) + 'deg) rotateX(-1.5deg)',
      opacity: enter,
      overflow:'hidden',
    }}>
      <div style={{position:'absolute', inset:0, pointerEvents:'none', background:'linear-gradient(110deg, transparent 0%, rgba(255,255,255,.055) 38%, transparent 54%)', transform:'translateX(' + ((localFrame % 220) - 110) * 2.4 + 'px)'}} />
      <div style={{fontFamily:'Arial, Helvetica, sans-serif', fontSize:15, fontWeight:700, letterSpacing:5, color:accent, opacity:.92, marginBottom:16}}>{scene.kicker}</div>
      <div style={{fontFamily:'Arial, Helvetica, sans-serif', fontSize:54, fontWeight:650, letterSpacing:-1.7, color:'#f7fbff', lineHeight:1.02, textShadow:'0 10px 36px rgba(0,0,0,.25)'}}>{scene.domain}</div>
      <div style={{height:1, margin:'26px 0 22px', background:'linear-gradient(90deg,' + accent + ',rgba(255,255,255,.08),transparent)'}} />
      <div style={{display:'flex', flexWrap:'wrap', gap:12}}>
        {scene.capabilities.map((capability, index) => {
          const itemEnter = interpolate(localFrame, [Math.round(fps * (.55 + index * .16)), Math.round(fps * (1.0 + index * .16))], [0,1], clamp);
          return <div key={capability} style={{
            padding:'13px 17px', borderRadius:18,
            background:'linear-gradient(135deg, rgba(255,255,255,.09), rgba(255,255,255,.025))',
            border:'1px solid rgba(255,255,255,.10)',
            color:'#e8eef2', fontFamily:'Arial, Helvetica, sans-serif', fontSize:22, fontWeight:500,
            opacity:itemEnter, transform:'translateY(' + (12 * (1-itemEnter)) + 'px)',
            boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)',
          }}>{capability}</div>;
        })}
      </div>
      {scene.ai_signal ? <div style={{
        marginTop:28, padding:'19px 20px', borderRadius:22,
        background:'linear-gradient(135deg, rgba(1,7,11,.34), rgba(255,255,255,.045))',
        border:'1px solid ' + accentSoft,
        display:'flex', alignItems:'center', gap:14,
      }}>
        <div style={{width:10,height:10,borderRadius:99,background:accent,boxShadow:'0 0 24px ' + accent}} />
        <div style={{fontFamily:'Arial, Helvetica, sans-serif', fontSize:20, color:'#dce7ec', lineHeight:1.25}}>{scene.ai_signal}</div>
      </div> : null}
    </div>
    <svg width={width} height={height} style={{position:'absolute', inset:0, opacity:.60 * enter, pointerEvents:'none'}}>
      <defs>
        <linearGradient id={'line-' + scene.id} x1="0" x2="1"><stop offset="0" stopColor={accent} stopOpacity="0"/><stop offset=".48" stopColor={accent} stopOpacity=".52"/><stop offset="1" stopColor={accent} stopOpacity="0"/></linearGradient>
      </defs>
      <path d={isLeft ? 'M 520 770 C 700 710, 760 785, 920 720' : 'M 1000 760 C 1190 690, 1280 770, 1450 705'} fill="none" stroke={'url(#line-' + scene.id + ')'} strokeWidth="1.3"/>
      {[0,1,2,3].map((i) => <circle key={i} cx={(isLeft?610:1120) + i*78 + Math.sin((localFrame+i*18)/28)*10} cy={760 - i*18 + Math.cos((localFrame+i*14)/31)*7} r={3.5 + (i%2)} fill={accent} opacity={.35 + i*.10}/>) }
    </svg>
  </>;
};

const Scene = ({scene, index}) => {
  const frame = useCurrentFrame();
  const frames = Math.max(1, Math.round(scene.duration_seconds * fps));
  const fadeIn = interpolate(frame, [0, Math.round(fps*.28)], [0,1], clamp);
  const fadeOut = interpolate(frame, [Math.max(0,frames-Math.round(fps*.35)), frames], [1,0], clamp);
  const opacity = Math.min(fadeIn, fadeOut);
  const sourceStart = Math.max(0, Math.round(scene.source_in_seconds * fps));
  return <AbsoluteFill style={{backgroundColor:'#020406', opacity}}>
    <OffthreadVideo src={staticFile('scene-' + index + '.mp4')} startFrom={sourceStart} volume={1} style={{width:'100%',height:'100%',objectFit:'cover'}} />
    <AbsoluteFill style={{background:'radial-gradient(circle at 50% 48%, transparent 30%, rgba(0,0,0,.08) 67%, rgba(0,0,0,.38) 100%)'}} />
    <GlassCard scene={scene} localFrame={frame} />
  </AbsoluteFill>;
};

const Main = () => {
  let cursor = 0;
  return <AbsoluteFill style={{backgroundColor:'#020406'}}>
    {scenes.map((scene,index) => {
      const duration = Math.max(1, Math.round(scene.duration_seconds * fps));
      const from = cursor;
      cursor += duration;
      return <Sequence key={scene.id} from={from} durationInFrames={duration}><Scene scene={scene} index={index}/></Sequence>;
    })}
  </AbsoluteFill>;
};

const totalFrames = scenes.reduce((sum, scene) => sum + Math.max(1, Math.round(scene.duration_seconds * fps)), 0);
export const RemotionRoot = () => <Composition id="SpatialProductTwin" component={Main} durationInFrames={totalFrames} fps={fps} width={width} height={height} />;
`;
}

function renderScriptSource({ entryPath, publicDir, outputPath }) {
  return `
const { bundle } = require('/tmp/avantiqo-remotion/node_modules/@remotion/bundler');
const { renderMedia, selectComposition } = require('/tmp/avantiqo-remotion/node_modules/@remotion/renderer');
(async () => {
  const serveUrl = await bundle({ entryPoint: ${JSON.stringify(entryPath)}, publicDir: ${JSON.stringify(publicDir)} });
  const composition = await selectComposition({ serveUrl, id: 'SpatialProductTwin' });
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: ${JSON.stringify(outputPath)},
    pixelFormat: 'yuv420p',
    crf: 15,
    audioCodec: 'aac',
    audioBitrate: '256k',
  });
  console.log(JSON.stringify({durationInFrames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height}));
})();
`;
}

export async function renderCreativeSpatialProductTwin({
  organization_id,
  project,
  scenes,
  width = 1920,
  height = 1080,
  fps = 24,
} = {}) {
  if (!text(organization_id)) throw new Error("SPATIAL_PRODUCT_TWIN_ORGANIZATION_REQUIRED");
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_REMOTION_SNAPSHOT_REQUIRED");
  const normalized = normalizeScenes(scenes);
  const safeWidth = Math.max(640, Math.floor(positive(width, 1920)));
  const safeHeight = Math.max(360, Math.floor(positive(height, 1080)));
  const safeFps = Math.max(12, Math.floor(positive(fps, 24)));
  const identity = jobId({ organization_id, project_id: project?.id, normalized, safeWidth, safeHeight, safeFps });
  const base = `/tmp/avantiqo-spatial-product-twin-${identity}`;
  const publicDir = `${base}/public`;
  const entryPath = `${base}/index.jsx`;
  const scriptPath = `${base}/render.cjs`;
  const outputPath = `${base}/spatial-product-twin.mp4`;

  const tracks = {};
  const sourceBuffers = [];
  for (const scene of normalized) {
    const [buffer, tracking] = await Promise.all([
      downloadReference(organization_id, scene.source_reference),
      CreativeOpenCVRuntime.execute({
        organization_id,
        project,
        operation: "CAMERA_TRACK",
        source_reference: scene.source_reference,
        sample_fps: 3,
        max_frames: 100,
      }).catch(() => ({ samples: [] })),
    ]);
    sourceBuffers.push(buffer);
    tracks[scene.id] = cleanTrack(tracking);
  }

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 900000,
    network_policy: "deny-all",
  });

  try {
    await CreativeSandboxRuntime.run({ sandbox, cmd: "mkdir", args: ["-p", publicDir] });
    await sandbox.writeFiles(sourceBuffers.map((buffer, index) => ({
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
      content: renderScriptSource({ entryPath, publicDir, outputPath }),
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
    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      mime_type: "video/mp4",
      codec: "h264",
      buffer,
      bytes: buffer.length,
      duration_seconds: normalized.reduce((sum, scene) => sum + scene.duration_seconds, 0),
      scene_count: normalized.length,
      full_screen_ui_ratio: 0,
      spatial_glass_tracking_proven: Object.values(tracks).every((samples) => samples.length > 0),
      design_policy: "LIVE_ENVIRONMENT_PRIMARY_LUXURY_GLASS_ONLY",
      metadata,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeSpatialProductTwinRuntime = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeSpatialProductTwin,
});
