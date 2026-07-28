#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const canonicalPath = path.resolve(
  "scripts/creative-studio-cole-master-video-render.mjs",
);

const brokenFilterBlock = `function videoFilter(inputIndex, entry) {
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
}`;

const fixedFilterBlock = `function videoFilter(inputIndex, entry) {
  return [
    \`[\${inputIndex}:v]trim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
    "setpts=PTS-STARTPTS",
    \`scale=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase\`,
    \`crop=\${OUTPUT_WIDTH}:\${OUTPUT_HEIGHT}\`,
    \`fps=\${OUTPUT_FRAME_RATE}\`,
    "setsar=1",
    "format=yuv420p",
  ].join(",") + \`[v\${entry.index}]\`;
}

function audioFilter(inputIndex, entry) {
  return [
    \`[\${inputIndex}:a]atrim=start=\${entry.source_in_seconds}:end=\${entry.source_out_seconds}\`,
    "asetpts=PTS-STARTPTS",
    "aformat=sample_rates=48000:channel_layouts=stereo",
  ].join(",") + \`[a\${entry.index}]\`;
}`;

const source = await fs.readFile(canonicalPath, "utf8");
let executableSource = source;

if (source.includes(brokenFilterBlock)) {
  executableSource = source.replace(brokenFilterBlock, fixedFilterBlock);
  console.log("FFMPEG_FILTER_HOTFIX=APPLIED");
} else if (source.includes(fixedFilterBlock)) {
  console.log("FFMPEG_FILTER_HOTFIX=NOT_REQUIRED");
} else {
  throw new Error("FFMPEG_FILTER_HOTFIX_TARGET_NOT_FOUND");
}

const temporaryPath = path.resolve(
  "scripts",
  `.creative-studio-cole-master-video-render-${process.pid}-${Date.now()}.mjs`,
);

await fs.writeFile(temporaryPath, executableSource, "utf8");

try {
  await import(`${pathToFileURL(temporaryPath).href}?run=${Date.now()}`);
} finally {
  await fs.rm(temporaryPath, { force: true });
}
