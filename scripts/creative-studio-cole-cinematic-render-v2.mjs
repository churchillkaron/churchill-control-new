#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const canonicalPath = path.resolve(
  "scripts/creative-studio-cole-master-video-render.mjs",
);

let source = await fs.readFile(canonicalPath, "utf8");

function replaceOnce(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}_PATCH_TARGET_COUNT_${count}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  "RUNTIME_VERSION",
  'const RUNTIME_VERSION = "cole-source-only-master-render-v1";',
  'const RUNTIME_VERSION = "cole-source-only-cinematic-master-render-v2";',
);

replaceOnce(
  "CINEMATIC_CONSTANTS",
  `const MINIMUM_DISTINCT_SOURCES = 4;
const MAXIMUM_CLIPS_PER_SOURCE = 4;`,
  `const MINIMUM_DISTINCT_SOURCES = 4;
const MAXIMUM_CLIPS_PER_SOURCE = 8;
const TRANSITION_SECONDS = 0.35;
const MINIMUM_CLIP_SECONDS = 4.25;
const MAXIMUM_CLIP_SECONDS = 8.25;
const CLIP_DURATION_PATTERN = [7.4, 5.8, 8.1, 6.4, 7.0, 5.2, 7.8, 6.0];`,
);

replaceOnce(
  "SELECT_TIMELINE",
  `function selectTimeline(candidates) {
  const sourceCounts = new Map();
  const preferred = [];
  const overflow = [];

  for (const candidate of candidates) {
    const sourceId = candidateSourceId(candidate) || candidate.id;
    const count = sourceCounts.get(sourceId) || 0;
    if (count < MAXIMUM_CLIPS_PER_SOURCE) {
      preferred.push(candidate);
      sourceCounts.set(sourceId, count + 1);
    } else {
      overflow.push(candidate);
    }
  }

  const entries = [];
  let cursor = 0;

  for (const candidate of [...preferred, ...overflow]) {
    if (cursor >= TARGET_DURATION_SECONDS - 0.001) break;
    const range = candidateRange(candidate);
    if (!range) continue;
    const duration = Math.min(
      range.duration_seconds,
      TARGET_DURATION_SECONDS - cursor,
    );
    if (duration <= 0) continue;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: candidateSourceId(candidate),
      source_candidate_node_id: candidate.id,
      source_url: candidate.url,
      source_in_seconds: range.start_seconds,
      source_out_seconds: range.start_seconds + duration,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + duration,
      duration_seconds: duration,
      selection_score: candidateScore(candidate),
      ai_verification_status: candidateStatus(candidate),
      evidence_source: EVIDENCE_SOURCE,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      human_review_required: true,
      original_source_range: range,
    });
    cursor += duration;
  }

  return {
    entries,
    duration_seconds: Number(cursor.toFixed(6)),
    distinct_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
}`,
  `function selectTimeline(candidates) {
  const buckets = new Map();

  for (const candidate of candidates) {
    const sourceId = candidateSourceId(candidate) || candidate.id;
    const bucket = buckets.get(sourceId) || [];
    if (bucket.length < MAXIMUM_CLIPS_PER_SOURCE) {
      bucket.push(candidate);
      buckets.set(sourceId, bucket);
    }
  }

  const orderedSources = [...buckets.entries()]
    .sort((left, right) =>
      candidateScore(right[1][0]) - candidateScore(left[1][0]));
  const interleaved = [];
  for (let depth = 0; depth < MAXIMUM_CLIPS_PER_SOURCE; depth += 1) {
    for (const [, bucket] of orderedSources) {
      if (bucket[depth]) interleaved.push(bucket[depth]);
    }
  }

  const entries = [];
  let outputDuration = 0;

  for (const candidate of interleaved) {
    if (outputDuration >= TARGET_DURATION_SECONDS - 0.001) break;
    const range = candidateRange(candidate);
    if (!range) continue;

    const overlap = entries.length ? TRANSITION_SECONDS : 0;
    const remaining = TARGET_DURATION_SECONDS - outputDuration;
    const desired = CLIP_DURATION_PATTERN[
      entries.length % CLIP_DURATION_PATTERN.length
    ];
    let requestedDuration = Math.min(
      MAXIMUM_CLIP_SECONDS,
      remaining + overlap,
      desired,
    );
    const projectedRemaining =
      remaining - Math.max(0, requestedDuration - overlap);
    if (
      projectedRemaining > 0 &&
      projectedRemaining < MINIMUM_CLIP_SECONDS
    ) {
      requestedDuration = Math.min(
        remaining + overlap,
        MAXIMUM_CLIP_SECONDS + MINIMUM_CLIP_SECONDS,
      );
    }
    const duration = Math.min(range.duration_seconds, requestedDuration);

    if (
      duration < MINIMUM_CLIP_SECONDS &&
      remaining > MINIMUM_CLIP_SECONDS
    ) continue;
    if (duration <= overlap + 0.1) continue;

    const availableOffset = Math.max(0, range.duration_seconds - duration);
    const offsetRatio = [0.12, 0.34, 0.58, 0.22, 0.46][
      entries.length % 5
    ];
    const sourceStart = range.start_seconds + availableOffset * offsetRatio;
    const timelineStart = entries.length
      ? Math.max(0, outputDuration - TRANSITION_SECONDS)
      : 0;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: candidateSourceId(candidate),
      source_candidate_node_id: candidate.id,
      source_url: candidate.url,
      source_in_seconds: sourceStart,
      source_out_seconds: sourceStart + duration,
      timeline_in_seconds: timelineStart,
      timeline_out_seconds: timelineStart + duration,
      duration_seconds: duration,
      selection_score: candidateScore(candidate),
      ai_verification_status: candidateStatus(candidate),
      evidence_source: EVIDENCE_SOURCE,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      human_review_required: true,
      original_source_range: range,
    });

    outputDuration += duration - overlap;
  }

  if (entries.length && outputDuration > TARGET_DURATION_SECONDS) {
    const excess = outputDuration - TARGET_DURATION_SECONDS;
    const last = entries[entries.length - 1];
    last.duration_seconds -= excess;
    last.source_out_seconds -= excess;
    last.timeline_out_seconds -= excess;
    outputDuration = TARGET_DURATION_SECONDS;
  }

  return {
    entries,
    duration_seconds: Number(outputDuration.toFixed(6)),
    distinct_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
}`,
);

replaceOnce(
  "CAMERA_FILTERS",
  `function videoFilter(inputIndex, entry) {
  return [
    \`[\${inputIndex}:v]\`,
    \`trim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
    "setpts=PTS-STARTPTS",
    \`scale=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase\`,
    \`crop=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}\`,
    \`fps=\${OUTPUT_FRAME_RATE}\`,
    "setsar=1",
    "format=yuv420p",
    \`[v\${entry.index}]\`,
  ].join(",").replace(",[v", "[v");
}

function audioFilter(inputIndex, entry) {
  return [
    \`[\${inputIndex}:a]\`,
    \`atrim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
    "asetpts=PTS-STARTPTS",
    "aformat=sample_rates=48000:channel_layouts=stereo",
    \`[a\${entry.index}]\`,
  ].join(",").replace(",[a", "[a");
}`,
  `function cameraExpressions(entry, subtle = false) {
  const frames = Math.max(
    1,
    Math.round(entry.duration_seconds * OUTPUT_FRAME_RATE),
  );
  const progress = \`min(on/\${frames},1)\`;
  const phase = Number((entry.index * 1.371) % 6.283).toFixed(3);
  const pattern = (entry.index - 1) % 5;
  const low = subtle ? 1.0 : 1.015;
  const high = subtle ? 1.035 : 1.085;
  let zoom;
  let x;
  let y;

  if (pattern === 0) {
    zoom = \`\${low}+(\${high}-\${low})*\${progress}\`;
    x = \`iw/2-(iw/zoom/2)+(iw-iw/zoom)*0.08*sin(on/43+\${phase})\`;
    y = \`ih/2-(ih/zoom/2)+(ih-ih/zoom)*0.06*cos(on/59+\${phase})\`;
  } else if (pattern === 1) {
    zoom = \`\${high}-(\${high}-\${low})*\${progress}\`;
    x = \`iw/2-(iw/zoom/2)+(iw-iw/zoom)*0.07*cos(on/47+\${phase})\`;
    y = \`ih/2-(ih/zoom/2)+(ih-ih/zoom)*0.05*sin(on/61+\${phase})\`;
  } else if (pattern === 2) {
    zoom = subtle ? "1.025" : "1.06";
    x = \`(iw-iw/zoom)*\${progress}\`;
    y = \`ih/2-(ih/zoom/2)+(ih-ih/zoom)*0.04*sin(on/67+\${phase})\`;
  } else if (pattern === 3) {
    zoom = subtle ? "1.025" : "1.06";
    x = \`(iw-iw/zoom)*(1-\${progress})\`;
    y = \`ih/2-(ih/zoom/2)+(ih-ih/zoom)*0.04*cos(on/71+\${phase})\`;
  } else {
    zoom = subtle
      ? \`1.012+0.018*sin(PI*\${progress})\`
      : \`1.035+0.035*sin(PI*\${progress})\`;
    x = \`iw/2-(iw/zoom/2)+(iw-iw/zoom)*0.16*sin(on/79+\${phase})\`;
    y = \`ih/2-(ih/zoom/2)+(ih-ih/zoom)*0.11*cos(on/91+\${phase})\`;
  }

  return {
    zoom,
    x: \`max(0,min(iw-iw/zoom,\${x}))\`,
    y: \`max(0,min(ih-ih/zoom,\${y}))\`,
  };
}

function videoFilter(inputIndex, entry, material) {
  const vertical =
    material.technical.height > material.technical.width * 1.15;
  const camera = cameraExpressions(entry, vertical);
  const grade =
    "eq=contrast=1.045:saturation=1.08:brightness=-0.012," +
    "unsharp=5:5:0.32:5:5:0.0";

  if (vertical) {
    const foregroundWidth = 608;
    const leftGuide = Math.floor((OUTPUT_WIDTH - foregroundWidth) / 2) - 26;
    const rightGuide = Math.floor((OUTPUT_WIDTH + foregroundWidth) / 2) + 24;
    return [
      \`color=c=0x050505:s=\${OUTPUT_WIDTH}x\${OUTPUT_HEIGHT}:r=\${OUTPUT_FRAME_RATE}:d=\${entry.duration_seconds}[bg\${entry.index}]\`,
      [
        \`[\${inputIndex}:v]trim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
        "setpts=PTS-STARTPTS",
        \`fps=\${OUTPUT_FRAME_RATE}\`,
        \`scale=\${foregroundWidth}:\${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease\`,
        \`pad=\${foregroundWidth}:\${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x050505\`,
        \`zoompan=z='\${camera.zoom}':x='\${camera.x}':y='\${camera.y}':d=1:s=\${foregroundWidth}x\${OUTPUT_HEIGHT}:fps=\${OUTPUT_FRAME_RATE}\`,
        grade,
        "format=rgba",
      ].join(",") + \`[fg\${entry.index}]\`,
      [
        \`[bg\${entry.index}]drawbox=x=\${leftGuide}:y=0:w=2:h=\${OUTPUT_HEIGHT}:color=0xD6A66A@0.30:t=fill\`,
        \`drawbox=x=\${rightGuide}:y=0:w=2:h=\${OUTPUT_HEIGHT}:color=0xD6A66A@0.30:t=fill\`,
        \`drawbox=x=0:y=0:w=\${OUTPUT_WIDTH}:h=8:color=0xD6A66A@0.10:t=fill\`,
        \`drawbox=x=0:y=\${OUTPUT_HEIGHT - 8}:w=\${OUTPUT_WIDTH}:h=8:color=0xD6A66A@0.10:t=fill\`,
      ].join(",") + \`[stage\${entry.index}]\`,
      \`[stage\${entry.index}][fg\${entry.index}]overlay=x='(W-w)/2+8*sin(t*0.31+\${entry.index})':y=0:shortest=1,format=yuv420p[v\${entry.index}]\`,
    ].join(";");
  }

  return [
    \`[\${inputIndex}:v]trim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
    "setpts=PTS-STARTPTS",
    \`fps=\${OUTPUT_FRAME_RATE}\`,
    \`scale=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase\`,
    \`crop=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}\`,
    \`zoompan=z='\${camera.zoom}':x='\${camera.x}':y='\${camera.y}':d=1:s=\${OUTPUT_WIDTH}x\${OUTPUT_HEIGHT}:fps=\${OUTPUT_FRAME_RATE}\`,
    grade,
    "format=yuv420p",
  ].join(",") + \`[v\${entry.index}]\`;
}

function audioFilter(inputIndex, entry) {
  return [
    \`[\${inputIndex}:a]atrim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
    "asetpts=PTS-STARTPTS",
    "aformat=sample_rates=48000:channel_layouts=stereo",
  ].join(",") + \`[a\${entry.index}]\`;
}`,
);

replaceOnce(
  "CINEMATIC_FILTER_GRAPH",
  `  const filters = [];
  for (const entry of selection.entries) {
    const inputIndex = inputIndexBySourceId.get(entry.source_asset_node_id);
    filters.push(videoFilter(inputIndex, entry));
    filters.push(audioFilter(inputIndex, entry));
  }

  filters.push(
    \`\${selection.entries
      .map((entry) => \`[v\${entry.index}][a\${entry.index}]\`)
      .join("")}concat=n=\${selection.entries.length}:v=1:a=1[basev][basea]\`,
  );
  filters.push(
    \`[\${logoInputIndex}:v]scale=480:-1,format=rgba,colorchannelmixer=aa=1,setpts=PTS-STARTPTS[logo]\`,
  );
  filters.push(
    \`[basev][logo]overlay=x=(main_w-overlay_w)/2:y=main_h-overlay_h-80:enable='between(t,172,180)'[outv]\`,
  );`,
  `  const filters = [];
  for (const entry of selection.entries) {
    const inputIndex = inputIndexBySourceId.get(entry.source_asset_node_id);
    const material = sourceMaterial.get(entry.source_asset_node_id);
    filters.push(videoFilter(inputIndex, entry, material));
    filters.push(audioFilter(inputIndex, entry));
  }

  const transitions = ["fade", "dissolve", "smoothleft", "fade", "smoothright"];
  let videoLabel = \`v\${selection.entries[0].index}\`;
  let audioLabel = \`a\${selection.entries[0].index}\`;
  let cumulativeDuration = selection.entries[0].duration_seconds;

  for (let index = 1; index < selection.entries.length; index += 1) {
    const entry = selection.entries[index];
    const nextVideoLabel = \`vx\${index + 1}\`;
    const nextAudioLabel = \`ax\${index + 1}\`;
    const offset = Number(
      (cumulativeDuration - TRANSITION_SECONDS).toFixed(6),
    );
    const transition = transitions[(index - 1) % transitions.length];
    filters.push(
      \`[\${videoLabel}][v\${entry.index}]xfade=transition=\${transition}:duration=\${TRANSITION_SECONDS}:offset=\${offset}[\${nextVideoLabel}]\`,
    );
    filters.push(
      \`[\${audioLabel}][a\${entry.index}]acrossfade=d=\${TRANSITION_SECONDS}:c1=tri:c2=tri[\${nextAudioLabel}]\`,
    );
    videoLabel = nextVideoLabel;
    audioLabel = nextAudioLabel;
    cumulativeDuration += entry.duration_seconds - TRANSITION_SECONDS;
  }

  filters.push(
    \`[\${logoInputIndex}:v]split=2[logoIntroSource][logoOutroSource]\`,
  );
  filters.push(
    "[logoIntroSource]scale=410:-1,format=rgba,colorchannelmixer=aa=0.94,fade=t=in:st=0:d=0.55:alpha=1,fade=t=out:st=3.1:d=0.9:alpha=1,setpts=PTS-STARTPTS[logoIntro]",
  );
  filters.push(
    "[logoOutroSource]scale=520:-1,format=rgba,colorchannelmixer=aa=0.98,fade=t=in:st=172:d=1.0:alpha=1,fade=t=out:st=179:d=1.0:alpha=1,setpts=PTS-STARTPTS[logoOutro]",
  );
  filters.push(
    \`[\${videoLabel}]vignette=PI/7,fade=t=in:st=0:d=0.45,fade=t=out:st=179.2:d=0.8[gradedv]\`,
  );
  filters.push(
    "[gradedv][logoIntro]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:enable='between(t,0,4)'[introV]",
  );
  filters.push(
    "[introV][logoOutro]overlay=x=(main_w-overlay_w)/2:y=main_h-overlay_h-60:enable='between(t,172,180)'[outv]",
  );
  filters.push(
    \`[\${audioLabel}]afade=t=in:st=0:d=0.25,afade=t=out:st=179.2:d=0.8[outa]\`,
  );`,
);

replaceOnce(
  "AUDIO_MAP",
  '    "-map", "[basea]",',
  '    "-map", "[outa]",',
);

replaceOnce(
  "LOCAL_OUTPUT_NAME",
  '`COLE_LEY_THREE_MINUTE_SHOWREEL_${timestamp}.mp4`',
  '`COLE_LEY_THREE_MINUTE_CINEMATIC_SHOWREEL_${timestamp}.mp4`',
);

replaceOnce(
  "STORAGE_OUTPUT_NAME",
  '    "cole-ley-three-minute-showreel.mp4",',
  '    "cole-ley-three-minute-cinematic-showreel.mp4",',
);

replaceOnce(
  "FINAL_RENDER_DESCRIPTION",
  '        "Source-only three-minute live-performance master with original audio, Cole Ley branding and mandatory human review.",',
  '        "Cinematic source-only three-minute live-performance master with dynamic pacing, smooth transitions, aspect-aware reframing, original audio, Cole Ley branding and mandatory human review.",',
);

const temporaryPath = path.resolve(
  "scripts",
  `.creative-studio-cole-cinematic-render-v2-${process.pid}-${Date.now()}.mjs`,
);
await fs.writeFile(temporaryPath, source, "utf8");

if (process.env.COLE_CINEMATIC_PATCH_ONLY === "true") {
  console.log(`PATCHED_RENDERER_PATH=${temporaryPath}`);
  process.exit(0);
}

console.log("CINEMATIC_RENDER_RUNTIME=V2");
console.log("VERTICAL_FRAME_POLICY=PRESERVE_FULL_FRAME_NO_BLUR");
console.log("CAMERA_MOVEMENT=ENABLED");
console.log("SMOOTH_TRANSITIONS=ENABLED");
console.log("DYNAMIC_PACING=ENABLED");

try {
  await import(`${pathToFileURL(temporaryPath).href}?run=${Date.now()}`);
} finally {
  await fs.rm(temporaryPath, { force: true });
}
