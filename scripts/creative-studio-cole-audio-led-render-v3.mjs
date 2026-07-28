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
  'const RUNTIME_VERSION = "cole-source-only-audio-led-master-render-v3";',
);

replaceOnce(
  "AUDIO_LED_CONSTANTS",
  `const MINIMUM_DISTINCT_SOURCES = 4;
const MAXIMUM_CLIPS_PER_SOURCE = 4;`,
  `const MINIMUM_DISTINCT_SOURCES = 4;
const MAXIMUM_CLIPS_PER_SOURCE = 8;
const SECTION_TRANSITION_SECONDS = 0.45;
const MINIMUM_SECTION_SECONDS = 20;
const MAXIMUM_SECTION_SECONDS = 48;
const MAXIMUM_SECTION_COUNT = 6;
const CLUSTER_GAP_SECONDS = 4;
const VISUAL_SHOT_PATTERN_SECONDS = [7.5, 6.0, 8.0, 6.5, 7.0];`,
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
  const bySource = new Map();

  for (const candidate of candidates) {
    const sourceId = candidateSourceId(candidate);
    const range = candidateRange(candidate);
    if (!sourceId || !range) continue;
    const bucket = bySource.get(sourceId) || [];
    bucket.push({ candidate, range });
    bySource.set(sourceId, bucket);
  }

  const clusters = [];
  for (const [sourceId, items] of bySource.entries()) {
    items.sort((left, right) =>
      left.range.start_seconds - right.range.start_seconds);
    let current = null;

    for (const item of items) {
      if (
        !current ||
        item.range.start_seconds > current.end_seconds + CLUSTER_GAP_SECONDS
      ) {
        if (current) clusters.push(current);
        current = {
          source_id: sourceId,
          start_seconds: item.range.start_seconds,
          end_seconds: item.range.end_seconds,
          candidates: [item.candidate],
        };
      } else {
        current.end_seconds = Math.max(
          current.end_seconds,
          item.range.end_seconds,
        );
        current.candidates.push(item.candidate);
      }
    }
    if (current) clusters.push(current);
  }

  const rankedClusters = clusters
    .map((cluster) => {
      const duration = cluster.end_seconds - cluster.start_seconds;
      const rankedCandidates = [...cluster.candidates].sort(
        (left, right) => candidateScore(right) - candidateScore(left),
      );
      const anchor = rankedCandidates[0];
      const anchorRange = candidateRange(anchor);
      const score = rankedCandidates.reduce(
        (total, candidate) => total + Math.max(0, candidateScore(candidate)),
        0,
      ) + Math.min(duration, MAXIMUM_SECTION_SECONDS) * 0.2;
      return {
        ...cluster,
        duration_seconds: duration,
        capacity_seconds: Math.min(duration, MAXIMUM_SECTION_SECONDS),
        score,
        anchor,
        anchor_midpoint: anchorRange
          ? (anchorRange.start_seconds + anchorRange.end_seconds) / 2
          : (cluster.start_seconds + cluster.end_seconds) / 2,
      };
    })
    .filter((cluster) =>
      cluster.capacity_seconds >= MINIMUM_SECTION_SECONDS)
    .sort((left, right) => right.score - left.score);

  const selected = [];
  const usedSources = new Set();

  for (const cluster of rankedClusters) {
    if (usedSources.has(cluster.source_id)) continue;
    selected.push(cluster);
    usedSources.add(cluster.source_id);
    if (selected.length >= MINIMUM_DISTINCT_SOURCES) break;
  }

  if (usedSources.size < MINIMUM_DISTINCT_SOURCES) {
    throw new Error(
      \`AUDIO_LED_SOURCE_DIVERSITY_NOT_READY:\${usedSources.size}\`,
    );
  }

  function targetMediaDuration(sectionCount) {
    return TARGET_DURATION_SECONDS +
      SECTION_TRANSITION_SECONDS * Math.max(0, sectionCount - 1);
  }

  function totalCapacity(items) {
    return items.reduce(
      (total, item) => total + item.capacity_seconds,
      0,
    );
  }

  for (const cluster of rankedClusters) {
    if (selected.includes(cluster)) continue;
    if (totalCapacity(selected) >= targetMediaDuration(selected.length)) break;
    selected.push(cluster);
    if (selected.length >= MAXIMUM_SECTION_COUNT) break;
  }

  const requiredMediaDuration = targetMediaDuration(selected.length);
  if (totalCapacity(selected) + 0.001 < requiredMediaDuration) {
    throw new Error(
      \`AUDIO_LED_DURATION_NOT_READY:\${totalCapacity(selected)}:\${requiredMediaDuration}\`,
    );
  }

  const allocations = selected.map((cluster) => ({
    cluster,
    duration_seconds: Math.min(
      MINIMUM_SECTION_SECONDS,
      cluster.capacity_seconds,
    ),
  }));

  let remaining = requiredMediaDuration - allocations.reduce(
    (total, allocation) => total + allocation.duration_seconds,
    0,
  );

  while (remaining > 0.0005) {
    let changed = false;
    for (const allocation of allocations) {
      const spare = allocation.cluster.capacity_seconds -
        allocation.duration_seconds;
      if (spare <= 0.0005) continue;
      const addition = Math.min(spare, remaining, 4);
      allocation.duration_seconds += addition;
      remaining -= addition;
      changed = true;
      if (remaining <= 0.0005) break;
    }
    if (!changed) break;
  }

  if (remaining > 0.001) {
    throw new Error(\`AUDIO_LED_ALLOCATION_FAILED:\${remaining}\`);
  }

  const entries = [];
  let cursor = 0;

  for (const allocation of allocations) {
    const { cluster } = allocation;
    const duration = allocation.duration_seconds;
    const latestStart = cluster.end_seconds - duration;
    const centeredStart = cluster.anchor_midpoint - duration / 2;
    const sourceStart = Math.max(
      cluster.start_seconds,
      Math.min(latestStart, centeredStart),
    );
    const overlap = entries.length ? SECTION_TRANSITION_SECONDS : 0;
    const timelineStart = Math.max(0, cursor - overlap);

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: cluster.source_id,
      source_candidate_node_id: cluster.anchor.id,
      source_url: cluster.anchor.url,
      source_in_seconds: sourceStart,
      source_out_seconds: sourceStart + duration,
      timeline_in_seconds: timelineStart,
      timeline_out_seconds: timelineStart + duration,
      duration_seconds: duration,
      selection_score: cluster.score,
      ai_verification_status: candidateStatus(cluster.anchor),
      evidence_source: EVIDENCE_SOURCE,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      human_review_required: true,
      audio_led_section: true,
      original_source_range: {
        start_seconds: cluster.start_seconds,
        end_seconds: cluster.end_seconds,
        duration_seconds: cluster.duration_seconds,
      },
    });

    cursor += duration - overlap;
  }

  return {
    entries,
    duration_seconds: Number(cursor.toFixed(6)),
    distinct_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
}`,
);

replaceOnce(
  "AUDIO_LED_CAMERA_FILTERS",
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
  `function buildVisualShots(entry) {
  const shots = [];
  let consumed = 0;
  let patternIndex = 0;

  while (consumed < entry.duration_seconds - 0.001) {
    const requested = VISUAL_SHOT_PATTERN_SECONDS[
      patternIndex % VISUAL_SHOT_PATTERN_SECONDS.length
    ];
    const duration = Math.min(
      requested,
      entry.duration_seconds - consumed,
    );
    shots.push({
      index: patternIndex + 1,
      source_in_seconds: entry.source_in_seconds + consumed,
      source_out_seconds: entry.source_in_seconds + consumed + duration,
      duration_seconds: duration,
    });
    consumed += duration;
    patternIndex += 1;
  }

  return shots;
}

function landscapeCamera(shot, sectionIndex) {
  const frames = Math.max(
    1,
    Math.round(shot.duration_seconds * OUTPUT_FRAME_RATE),
  );
  const progress = \`min(on/\${frames},1)\`;
  const pattern = (shot.index + sectionIndex) % 5;

  if (pattern === 0) {
    return {
      zoom: \`1.01+0.075*\${progress}\`,
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)",
    };
  }
  if (pattern === 1) {
    return {
      zoom: \`1.085-0.07*\${progress}\`,
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)",
    };
  }
  if (pattern === 2) {
    return {
      zoom: "1.06",
      x: \`(iw-iw/zoom)*\${progress}\`,
      y: "ih/2-(ih/zoom/2)",
    };
  }
  if (pattern === 3) {
    return {
      zoom: "1.06",
      x: \`(iw-iw/zoom)*(1-\${progress})\`,
      y: "ih/2-(ih/zoom/2)",
    };
  }
  return {
    zoom: \`1.025+0.035*sin(PI*\${progress})\`,
    x: \`iw/2-(iw/zoom/2)+(iw-iw/zoom)*0.10*sin(on/45+\${sectionIndex})\`,
    y: \`ih/2-(ih/zoom/2)+(ih-ih/zoom)*0.07*cos(on/61+\${sectionIndex})\`,
  };
}

function videoFilter(inputIndex, entry, material) {
  const shots = buildVisualShots(entry);
  const vertical =
    material.technical.height > material.technical.width * 1.15;
  const rawLabels = shots.map(
    (shot) => \`[e\${entry.index}raw\${shot.index}]\`,
  );
  const filters = [
    \`[\${inputIndex}:v]split=\${shots.length}\${rawLabels.join("")}\`,
  ];
  const outputLabels = [];

  for (const shot of shots) {
    const rawLabel = \`e\${entry.index}raw\${shot.index}\`;
    const outputLabel = \`e\${entry.index}shot\${shot.index}\`;
    outputLabels.push(\`[\${outputLabel}]\`);

    if (vertical) {
      const foregroundWidth = 608;
      const stageLabel = \`e\${entry.index}stage\${shot.index}\`;
      const foregroundLabel = \`e\${entry.index}fg\${shot.index}\`;
      filters.push(
        \`color=c=0x050505:s=\${OUTPUT_WIDTH}x\${OUTPUT_HEIGHT}:r=\${OUTPUT_FRAME_RATE}:d=\${shot.duration_seconds},drawbox=x=628:y=0:w=2:h=\${OUTPUT_HEIGHT}:color=0xD6A66A@0.26:t=fill,drawbox=x=1290:y=0:w=2:h=\${OUTPUT_HEIGHT}:color=0xD6A66A@0.26:t=fill[\${stageLabel}]\`,
      );
      filters.push(
        [
          \`[\${rawLabel}]trim=start=\${shot.source_in_seconds}:end=\${shot.source_out_seconds}\`,
          "setpts=PTS-STARTPTS",
          \`fps=\${OUTPUT_FRAME_RATE}\`,
          \`scale=\${foregroundWidth}:\${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease\`,
          \`pad=\${foregroundWidth}:\${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x050505\`,
          "eq=contrast=1.035:saturation=1.06:brightness=-0.008",
          "unsharp=5:5:0.25:5:5:0.0",
          "format=rgba",
        ].join(",") + \`[\${foregroundLabel}]\`,
      );
      filters.push(
        \`[\${stageLabel}][\${foregroundLabel}]overlay=x='(W-w)/2+6*sin(t*0.36+\${shot.index + entry.index})':y=0:shortest=1,format=yuv420p[\${outputLabel}]\`,
      );
      continue;
    }

    const camera = landscapeCamera(shot, entry.index);
    filters.push(
      [
        \`[\${rawLabel}]trim=start=\${shot.source_in_seconds}:end=\${shot.source_out_seconds}\`,
        "setpts=PTS-STARTPTS",
        \`fps=\${OUTPUT_FRAME_RATE}\`,
        \`scale=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase\`,
        \`crop=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}\`,
        \`zoompan=z='\${camera.zoom}':x='max(0,min(iw-iw/zoom,\${camera.x}))':y='max(0,min(ih-ih/zoom,\${camera.y}))':d=1:s=\${OUTPUT_WIDTH}x\${OUTPUT_HEIGHT}:fps=\${OUTPUT_FRAME_RATE}\`,
        "eq=contrast=1.045:saturation=1.08:brightness=-0.012",
        "unsharp=5:5:0.32:5:5:0.0",
        "format=yuv420p",
      ].join(",") + \`[\${outputLabel}]\`,
    );
  }

  filters.push(
    \`\${outputLabels.join("")}concat=n=\${shots.length}:v=1:a=0[v\${entry.index}]\`,
  );
  return filters.join(";");
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
  "AUDIO_LED_FILTER_GRAPH",
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

  const transitions = ["fade", "dissolve", "smoothleft", "fade"];
  let videoLabel = \`v\${selection.entries[0].index}\`;
  let audioLabel = \`a\${selection.entries[0].index}\`;
  let cumulativeDuration = selection.entries[0].duration_seconds;

  for (let index = 1; index < selection.entries.length; index += 1) {
    const entry = selection.entries[index];
    const nextVideoLabel = \`sectionVideo\${index + 1}\`;
    const nextAudioLabel = \`sectionAudio\${index + 1}\`;
    const offset = Number(
      (cumulativeDuration - SECTION_TRANSITION_SECONDS).toFixed(6),
    );
    const transition = transitions[(index - 1) % transitions.length];
    filters.push(
      \`[\${videoLabel}][v\${entry.index}]xfade=transition=\${transition}:duration=\${SECTION_TRANSITION_SECONDS}:offset=\${offset}[\${nextVideoLabel}]\`,
    );
    filters.push(
      \`[\${audioLabel}][a\${entry.index}]acrossfade=d=\${SECTION_TRANSITION_SECONDS}:c1=tri:c2=tri[\${nextAudioLabel}]\`,
    );
    videoLabel = nextVideoLabel;
    audioLabel = nextAudioLabel;
    cumulativeDuration += entry.duration_seconds - SECTION_TRANSITION_SECONDS;
  }

  filters.push(
    \`[\${logoInputIndex}:v]scale=190:-1,format=rgba,colorchannelmixer=aa=0.78,setpts=PTS-STARTPTS[cornerLogo]\`,
  );
  filters.push(
    \`[\${videoLabel}]vignette=PI/8,fade=t=in:st=0:d=0.35,fade=t=out:st=179.35:d=0.65[gradedv]\`,
  );
  filters.push(
    "[gradedv][cornerLogo]overlay=x=main_w-overlay_w-34:y=main_h-overlay_h-26:shortest=1[outv]",
  );
  filters.push(
    \`[\${audioLabel}]afade=t=in:st=0:d=0.2,afade=t=out:st=179.25:d=0.75[outa]\`,
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
  '`COLE_LEY_THREE_MINUTE_AUDIO_LED_SHOWREEL_${timestamp}.mp4`',
);

replaceOnce(
  "STORAGE_OUTPUT_NAME",
  '    "cole-ley-three-minute-showreel.mp4",',
  '    "cole-ley-three-minute-audio-led-showreel.mp4",',
);

replaceOnce(
  "FINAL_RENDER_DESCRIPTION",
  '        "Source-only three-minute live-performance master with original audio, Cole Ley branding and mandatory human review.",',
  '        "Audio-led three-minute live-performance master using coherent musical sections, continuous source audio, virtual camera coverage, aspect-aware framing and a persistent corner logo.",',
);

const temporaryPath = path.resolve(
  "scripts",
  `.creative-studio-cole-audio-led-render-v3-${process.pid}-${Date.now()}.mjs`,
);
await fs.writeFile(temporaryPath, source, "utf8");

if (process.env.COLE_AUDIO_LED_PATCH_ONLY === "true") {
  console.log(`PATCHED_RENDERER_PATH=${temporaryPath}`);
  process.exit(0);
}

console.log("AUDIO_LED_RENDER_RUNTIME=V3");
console.log("MUSICAL_SECTION_POLICY=CONTINUOUS_SOURCE_AUDIO");
console.log("VISUAL_COVERAGE_POLICY=VIRTUAL_CAMERA_WITHIN_SECTION");
console.log("VERTICAL_FRAME_POLICY=PRESERVE_FULL_FRAME_NO_BLUR");
console.log("PERSISTENT_CORNER_LOGO=YES");
console.log("LOGO_POSITION=BOTTOM_RIGHT");

try {
  await import(`${pathToFileURL(temporaryPath).href}?run=${Date.now()}`);
} finally {
  await fs.rm(temporaryPath, { force: true });
}
