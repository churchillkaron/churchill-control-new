import crypto from "node:crypto";

import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_REMOTION_RUNTIME_V1";
const TOOL_ID = "remotion";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function snapshotId(project) {
  return text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
}

function jobId(input) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 20);
}

function normalizeLayers(layers) {
  if (!Array.isArray(layers)) return [];
  return layers.slice(0, 40).map((layer, index) => ({
    id: text(layer?.id) || `layer-${index + 1}`,
    type: ["title", "subtitle", "glass-card", "line", "label"].includes(layer?.type)
      ? layer.type
      : "label",
    text: text(layer?.text),
    eyebrow: text(layer?.eyebrow),
    start: Math.max(0, finite(layer?.start_seconds, 0)),
    end: Math.max(0, finite(layer?.end_seconds, 9999)),
    x: finite(layer?.x, 0.5),
    y: finite(layer?.y, 0.5),
    width: finite(layer?.width, 0.7),
    align: ["left", "center", "right"].includes(layer?.align) ? layer.align : "center",
    size: positiveInteger(layer?.font_size, layer?.type === "title" ? 84 : 34),
    weight: positiveInteger(layer?.font_weight, layer?.type === "title" ? 600 : 400),
    opacity: Math.max(0, Math.min(1, finite(layer?.opacity, 1))),
    blur: Math.max(0, finite(layer?.backdrop_blur, 18)),
    radius: Math.max(0, finite(layer?.border_radius, 24)),
  }));
}

function entrySource({ width, height, fps, durationFrames, layers }) {
  return `
import React from 'react';
import { AbsoluteFill, Composition, interpolate, useCurrentFrame } from 'remotion';

const fps = ${fps};
const layers = ${JSON.stringify(layers)};

const Layer = ({ layer }) => {
  const frame = useCurrentFrame();
  const start = Math.round(layer.start * fps);
  const end = Math.round(layer.end * fps);
  if (frame < start || frame > end) return null;
  const fadeIn = interpolate(frame, [start, start + Math.max(1, Math.round(fps * 0.4))], [0, layer.opacity], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [Math.max(start, end - Math.round(fps * 0.35)), end], [layer.opacity, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = Math.min(fadeIn, fadeOut);
  const lift = interpolate(frame, [start, start + Math.max(1, Math.round(fps * 0.55))], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const base = {
    position: 'absolute',
    left: (layer.x * 100) + '%',
    top: (layer.y * 100) + '%',
    width: (layer.width * 100) + '%',
    transform: 'translate(-50%, -50%) translateY(' + lift + 'px)',
    opacity,
    textAlign: layer.align,
    color: '#f5f1e8',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: layer.size,
    fontWeight: layer.weight,
    letterSpacing: layer.type === 'title' ? '-0.035em' : '0.01em',
    lineHeight: 1.02,
    textShadow: '0 2px 24px rgba(0,0,0,0.4)',
  };

  if (layer.type === 'glass-card') {
    return <div style={{...base, padding: '28px 34px', borderRadius: layer.radius, background: 'linear-gradient(135deg, rgba(22,22,24,0.42), rgba(38,34,28,0.22))', border: '1px solid rgba(214,185,125,0.28)', boxShadow: '0 28px 90px rgba(0,0,0,0.38), inset 0 1px rgba(255,255,255,0.08)', backdropFilter: 'blur(' + layer.blur + 'px)'}}>
      {layer.eyebrow ? <div style={{fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#cdb27a', marginBottom: 12}}>{layer.eyebrow}</div> : null}
      <div>{layer.text}</div>
    </div>;
  }

  if (layer.type === 'line') {
    return <div style={{...base, height: 1, background: 'linear-gradient(90deg, transparent, rgba(214,185,125,0.85), transparent)'}} />;
  }

  return <div style={base}>{layer.text}</div>;
};

const Main = () => <AbsoluteFill style={{backgroundColor: 'transparent'}}>{layers.map((layer) => <Layer key={layer.id} layer={layer} />)}</AbsoluteFill>;

export const RemotionRoot = () => <Composition id="AvantiqoComposition" component={Main} durationInFrames={${durationFrames}} fps={fps} width={${width}} height={${height}} />;
`;
}

function renderScriptSource({ entryPath, outputPath }) {
  return `
const { bundle } = require('/tmp/avantiqo-remotion/node_modules/@remotion/bundler');
const { renderMedia, selectComposition } = require('/tmp/avantiqo-remotion/node_modules/@remotion/renderer');

(async () => {
  const serveUrl = await bundle({ entryPoint: ${JSON.stringify(entryPath)} });
  const composition = await selectComposition({ serveUrl, id: 'AvantiqoComposition' });
  await renderMedia({
    composition,
    serveUrl,
    codec: 'prores',
    outputLocation: ${JSON.stringify(outputPath)},
    proResProfile: '4444',
    pixelFormat: 'yuva444p10le',
  });
  console.log(JSON.stringify({ durationInFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height }));
})();
`;
}

export async function renderCreativeMotionComposition({
  project,
  duration_seconds,
  layers = [],
  width = 1920,
  height = 1080,
  fps = 30,
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_REMOTION_SNAPSHOT_REQUIRED");

  const safeWidth = positiveInteger(width, 1920);
  const safeHeight = positiveInteger(height, 1080);
  const safeFps = positiveInteger(fps, 30);
  const safeDuration = Math.max(0.1, finite(duration_seconds, 1));
  const durationFrames = Math.max(1, Math.round(safeDuration * safeFps));
  const normalizedLayers = normalizeLayers(layers);
  const identity = jobId({ safeWidth, safeHeight, safeFps, durationFrames, normalizedLayers });
  const base = `/tmp/avantiqo-remotion-job-${identity}`;
  const entryPath = `${base}/index.jsx`;
  const renderScriptPath = `${base}/render.cjs`;
  const outputPath = `${base}/overlay.mov`;

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 600000,
    network_policy: "deny-all",
  });

  try {
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: entryPath,
      content: entrySource({
        width: safeWidth,
        height: safeHeight,
        fps: safeFps,
        durationFrames,
        layers: normalizedLayers,
      }),
    });
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: renderScriptPath,
      content: renderScriptSource({ entryPath, outputPath }),
    });

    const execution = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "node",
      args: [renderScriptPath],
      error_prefix: "CREATIVE_REMOTION_RENDER_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({ sandbox, path: outputPath });

    let metadata = null;
    try {
      metadata = JSON.parse(execution.stdout || "null");
    } catch {
      metadata = null;
    }

    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      mime_type: "video/quicktime",
      codec: "prores_4444",
      has_alpha: true,
      buffer,
      bytes: buffer.length,
      duration_seconds: safeDuration,
      metadata,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeRemotionRuntime = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeMotionComposition,
});
