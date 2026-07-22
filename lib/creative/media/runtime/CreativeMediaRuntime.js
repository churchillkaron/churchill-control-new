import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
const MEDIA_DOWNLOAD_TIMEOUT_MS = 120000;

function runFfmpeg(args = []) {
  if (!ffmpegPath) {
    throw new Error("FFMPEG_RUNTIME_UNAVAILABLE");
  }

  return new Promise((resolve, reject) => {
    const process = spawn(
      ffmpegPath,
      ["-hide_banner", "-loglevel", "error", ...args],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else {
        reject(
          new Error(
            `FFMPEG_FAILED_${code}: ${stderr.slice(-4000)}`,
          ),
        );
      }
    });
  });
}

function runFfmpegCapture(args = [], { allowFailure = false } = {}) {
  if (!ffmpegPath) {
    throw new Error("FFMPEG_RUNTIME_UNAVAILABLE");
  }

  return new Promise((resolve, reject) => {
    const process = spawn(
      ffmpegPath,
      ["-hide_banner", ...args],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0 || allowFailure) {
        resolve({ code, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `FFMPEG_FAILED_${code}: ${stderr.slice(-4000)}`,
        ),
      );
    });
  });
}

function dataUrl(value) {
  const match = String(value || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i,
  );
  if (!match) return null;

  return {
    content_type: match[1] || "application/octet-stream",
    buffer: match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3])),
  };
}

async function download(url, target) {
  const inline = dataUrl(url);
  if (inline) {
    if (inline.buffer.length > MAX_MEDIA_BYTES) {
      throw new Error("MEDIA_DOWNLOAD_TOO_LARGE");
    }
    await writeFile(target, inline.buffer);
    return;
  }

  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("MEDIA_DOWNLOAD_HTTPS_REQUIRED");
  }

  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(MEDIA_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`MEDIA_DOWNLOAD_FAILED_${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_MEDIA_BYTES) {
    throw new Error("MEDIA_DOWNLOAD_TOO_LARGE");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error("MEDIA_DOWNLOAD_TOO_LARGE");
  }

  await writeFile(target, buffer);
}

async function withWorkspace(prefix, operation) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), prefix),
  );

  try {
    return await operation(directory);
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

function secondsFromDuration(value = "") {
  const match = String(value).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3])
  );
}

async function probeFile(file) {
  const result = await runFfmpegCapture(
    ["-i", file],
    { allowFailure: true },
  );
  const text = result.stderr || "";
  const durationMatch = text.match(/Duration:\s*([^,]+)/i);
  const videoMatch = text.match(
    /Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b[^\n]*?(\d+(?:\.\d+)?)\s*fps/i,
  );

  return {
    duration_seconds: secondsFromDuration(durationMatch?.[1] || ""),
    width: Number(videoMatch?.[1] || 0),
    height: Number(videoMatch?.[2] || 0),
    fps: Number(videoMatch?.[3] || 0),
    has_video: /Video:/i.test(text),
    has_audio: /Audio:/i.test(text),
  };
}

function lastNumber(text, pattern) {
  const values = [...String(text || "").matchAll(pattern)];
  const value = values.at(-1)?.[1];
  return value === undefined ? null : Number(value);
}

async function analyzeAudioFile(file, probe = null) {
  const media = probe || await probeFile(file);
  if (!media.has_audio) {
    return {
      has_audio: false,
      duration_seconds: media.duration_seconds,
      integrated_lufs: null,
      loudness_range_lu: null,
      true_peak_dbtp: null,
      silence_duration_seconds: media.duration_seconds,
      silence_ratio: media.duration_seconds > 0 ? 1 : 0,
    };
  }

  const result = await runFfmpegCapture([
    "-nostats",
    "-i", file,
    "-map", "0:a:0",
    "-af", "ebur128=peak=true,silencedetect=noise=-50dB:d=0.5",
    "-f", "null",
    "-",
  ]);
  const text = result.stderr || "";
  const silenceDurations = [
    ...text.matchAll(/silence_duration:\s*([\d.]+)/g),
  ].map((match) => Number(match[1] || 0));
  const silenceDuration = silenceDurations.reduce(
    (total, value) => total + value,
    0,
  );

  return {
    has_audio: true,
    duration_seconds: media.duration_seconds,
    integrated_lufs: lastNumber(text, /\bI:\s*(-?[\d.]+)\s*LUFS/g),
    loudness_range_lu: lastNumber(text, /\bLRA:\s*(-?[\d.]+)\s*LU/g),
    true_peak_dbtp: lastNumber(text, /\bPeak:\s*(-?[\d.]+)\s*dBFS/g),
    silence_duration_seconds: silenceDuration,
    silence_ratio:
      media.duration_seconds > 0
        ? Math.min(1, silenceDuration / media.duration_seconds)
        : 0,
  };
}

function assTime(seconds = 0) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${remaining
    .toFixed(2)
    .padStart(5, "0")}`;
}

function assText(value = "") {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replace(/\r?\n/g, "\\N")
    .replaceAll(",", "\\,");
}

function assColor(value = "#FFFFFF") {
  const normalized = String(value || "#FFFFFF")
    .replace("#", "")
    .padEnd(6, "F")
    .slice(0, 6);
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);

  return `&H00${blue}${green}${red}`;
}

function overlayAlignment(value = "bottom_center") {
  const alignments = {
    bottom_left: 1,
    bottom_center: 2,
    bottom_right: 3,
    middle_left: 4,
    middle_center: 5,
    middle_right: 6,
    top_left: 7,
    top_center: 8,
    top_right: 9,
  };

  return alignments[value] || 2;
}

function buildAssDocument({
  overlays = [],
  width,
  height,
  typography = {},
}) {
  const fontFamily = typography.font_family || "Arial";
  const fontSize = Number(
    typography.font_size ||
    Math.max(34, Math.round(height * 0.038)),
  );
  const primaryColor = assColor(
    typography.color || "#FFFFFF",
  );
  const outlineColor = assColor(
    typography.outline_color || "#000000",
  );
  const marginHorizontal = Number(
    typography.safe_margin_horizontal ||
    Math.round(width * 0.06),
  );
  const marginVertical = Number(
    typography.safe_margin_vertical ||
    Math.round(height * 0.07),
  );

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${primaryColor},${primaryColor},${outlineColor},&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,${marginHorizontal},${marginHorizontal},${marginVertical},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = overlays
    .filter((overlay) => overlay?.text)
    .map((overlay) => {
      const start = assTime(overlay.start_seconds || 0);
      const end = assTime(
        overlay.end_seconds ||
        Number(overlay.start_seconds || 0) + 2,
      );
      const alignment = overlayAlignment(
        overlay.alignment ||
        (overlay.type === "SUBTITLE"
          ? "bottom_center"
          : "middle_center"),
      );
      const size = Number(overlay.font_size || fontSize);
      const color = assColor(
        overlay.color || typography.color || "#FFFFFF",
      );
      const text = `{\\an${alignment}\\fs${size}\\1c${color}}${assText(overlay.text)}`;

      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    });

  return [header, ...events].join("\n");
}

function aspectDimensions(aspectRatio = "16:9") {
  const dimensions = {
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
  };

  return dimensions[aspectRatio] || dimensions["16:9"];
}

function colorFilter(color = {}) {
  const filters = [];
  const brightness = Number(color.brightness || 0);
  const contrast = Number(color.contrast || 1);
  const saturation = Number(color.saturation || 1);
  const gamma = Number(color.gamma || 1);

  filters.push(
    `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`,
  );

  if (color.deflicker === true) {
    filters.push("deflicker=size=5:mode=pm");
  }

  return filters;
}

function transitionDefinition(left = {}, right = {}) {
  const source =
    String(left?.type || "CUT").toUpperCase() !== "CUT"
      ? left
      : right;
  const type = String(source?.type || "CUT").toUpperCase();
  const map = {
    DISSOLVE: "fade",
    CROSS_DISSOLVE: "fade",
    FADE: "fade",
    FADE_BLACK: "fadeblack",
    FADE_WHITE: "fadewhite",
    WIPE_LEFT: "wipeleft",
    WIPE_RIGHT: "wiperight",
    WIPE_UP: "wipeup",
    WIPE_DOWN: "wipedown",
    SLIDE_LEFT: "slideleft",
    SLIDE_RIGHT: "slideright",
    SLIDE_UP: "slideup",
    SLIDE_DOWN: "slidedown",
    CIRCLE_OPEN: "circleopen",
    CIRCLE_CLOSE: "circleclose",
    PIXELIZE: "pixelize",
  };

  if (type === "CUT" || !map[type]) {
    return { type: "CUT", ffmpeg: null, duration_seconds: 0 };
  }

  return {
    type,
    ffmpeg: map[type],
    duration_seconds: Math.max(
      0.1,
      Math.min(2, Number(source.duration_seconds || source.duration || 0.5)),
    ),
  };
}

export const CreativeMediaRuntime = {
  async inspectMedia({ media_url } = {}) {
    if (!media_url) throw new Error("media_url required");

    return withWorkspace(
      "avantiqo-media-inspection-",
      async (directory) => {
        const input = path.join(directory, "source-media");
        await download(media_url, input);
        const probe = await probeFile(input);
        const audio = await analyzeAudioFile(input, probe);

        return {
          ...probe,
          audio,
          inspected_at: new Date().toISOString(),
          evidence_version: "creative-media-evidence-v2",
        };
      },
    );
  },

  async extractContactSheet({
    video_url,
    frame_count = 9,
  } = {}) {
    if (!video_url) throw new Error("video_url required");

    return withWorkspace(
      "avantiqo-video-qa-",
      async (directory) => {
        const input = path.join(directory, "source.mp4");
        const output = path.join(directory, "contact-sheet.jpg");
        await download(video_url, input);

        const probe = await probeFile(input);
        const duration = Number(probe.duration_seconds || 0);
        if (!duration) {
          throw new Error("MEDIA_DURATION_UNAVAILABLE");
        }

        const count = Math.max(
          4,
          Math.min(25, Number(frame_count || 9)),
        );
        const columns = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / columns);
        const sampleRate = Math.max(0.0001, count / duration);

        await runFfmpeg([
          "-i", input,
          "-vf",
          `fps=${sampleRate.toFixed(8)},scale=480:-2,tile=${columns}x${rows}:nb_frames=${count}:padding=6:margin=6`,
          "-frames:v", "1",
          "-q:v", "2",
          output,
        ]);

        return {
          buffer: await readFile(output),
          content_type: "image/jpeg",
          filename: "video-contact-sheet.jpg",
          frame_count: count,
          duration_seconds: duration,
          sampling_mode: "UNIFORM_COMPLETE_DURATION",
          sample_interval_seconds: duration / count,
          media_probe: probe,
        };
      },
    );
  },

  async composeMaster({
    edit_decision_list = [],
    width = 1920,
    height = 1080,
    fps = 30,
  } = {}) {
    if (!edit_decision_list.length) {
      throw new Error("EDIT_DECISION_LIST_EMPTY");
    }

    return withWorkspace(
      "avantiqo-picture-assembly-",
      async (directory) => {
        const normalized = [];
        const durations = [];

        for (let index = 0; index < edit_decision_list.length; index += 1) {
          const clip = edit_decision_list[index];
          if (!clip.source_url) {
            throw new Error(
              `CLIP_SOURCE_MISSING_${clip.shot_id || index}`,
            );
          }

          const input = path.join(directory, `input-${index}.mp4`);
          const output = path.join(directory, `clip-${index}.mp4`);
          await download(clip.source_url, input);

          const duration = Math.max(
            0.25,
            Number(clip.duration_seconds || 0),
          );
          const sourceIn = Math.max(
            0,
            Number(clip.source_in_seconds || 0),
          );

          await runFfmpeg([
            "-ss", String(sourceIn),
            "-i", input,
            "-t", String(duration),
            "-vf",
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p`,
            "-an",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-movflags", "+faststart",
            output,
          ]);

          normalized.push(output);
          durations.push(duration);
        }

        const finalPath = path.join(directory, "picture-assembly.mp4");
        const inputs = normalized.flatMap((file) => ["-i", file]);
        const filters = normalized.map(
          (_, index) => `[${index}:v]setpts=PTS-STARTPTS[v${index}src]`,
        );
        const transitions = [];
        let current = "[v0src]";
        let accumulatedDuration = durations[0];

        for (let index = 1; index < normalized.length; index += 1) {
          const transition = transitionDefinition(
            edit_decision_list[index - 1]?.transition_out,
            edit_decision_list[index]?.transition_in,
          );
          const next = `[v${index}src]`;
          const output = `[v${index}out]`;

          if (transition.type === "CUT") {
            filters.push(
              `${current}${next}concat=n=2:v=1:a=0${output}`,
            );
            accumulatedDuration += durations[index];
          } else {
            const maximumDuration = Math.max(
              0.1,
              Math.min(durations[index - 1], durations[index]) * 0.45,
            );
            const transitionDuration = Math.min(
              transition.duration_seconds,
              maximumDuration,
            );
            const offset = Math.max(
              0,
              accumulatedDuration - transitionDuration,
            );
            filters.push(
              `${current}${next}xfade=transition=${transition.ffmpeg}:duration=${transitionDuration}:offset=${offset}${output}`,
            );
            accumulatedDuration += durations[index] - transitionDuration;
            transitions.push({
              index,
              type: transition.type,
              duration_seconds: transitionDuration,
              offset_seconds: offset,
            });
          }

          current = output;
        }

        await runFfmpeg([
          ...inputs,
          "-filter_complex", filters.join(";"),
          "-map", current,
          "-an",
          "-c:v", "libx264",
          "-preset", "slow",
          "-crf", "17",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          finalPath,
        ]);

        return {
          buffer: await readFile(finalPath),
          content_type: "video/mp4",
          filename: "picture-assembly-16x9.mp4",
          width,
          height,
          fps,
          duration_seconds: accumulatedDuration,
          transitions_applied: transitions,
          transition_count: transitions.length,
        };
      },
    );
  },

  async finishPicture({
    source_url,
    overlays = [],
    aspect_ratio = "16:9",
    typography = {},
    color = {},
    fps = 30,
  } = {}) {
    if (!source_url) {
      throw new Error("source_url required");
    }

    const { width, height } = aspectDimensions(aspect_ratio);

    return withWorkspace(
      "avantiqo-picture-finish-",
      async (directory) => {
        const input = path.join(directory, "source.mp4");
        const subtitleFile = path.join(directory, "overlays.ass");
        const output = path.join(
          directory,
          `picture-finish-${aspect_ratio.replace(":", "x")}.mp4`,
        );

        await download(source_url, input);
        await writeFile(
          subtitleFile,
          buildAssDocument({
            overlays,
            width,
            height,
            typography,
          }),
          "utf8",
        );

        const filters = [
          `scale=${width}:${height}:force_original_aspect_ratio=increase`,
          `crop=${width}:${height}`,
          ...colorFilter(color),
        ];

        if (overlays.some((overlay) => overlay?.text)) {
          filters.push(
            `ass=${subtitleFile.replaceAll("\\", "/").replaceAll(":", "\\:")}`,
          );
        }

        filters.push(`fps=${fps}`, "format=yuv420p");

        await runFfmpeg([
          "-i", input,
          "-vf", filters.join(","),
          "-an",
          "-c:v", "libx264",
          "-preset", "slow",
          "-crf", "17",
          "-movflags", "+faststart",
          output,
        ]);

        const probe = await probeFile(output);

        return {
          buffer: await readFile(output),
          content_type: "video/mp4",
          filename:
            `picture-finish-${aspect_ratio.replace(":", "x")}.mp4`,
          width,
          height,
          fps,
          aspect_ratio,
          duration_seconds: probe.duration_seconds,
          overlays_applied: overlays.length,
        };
      },
    );
  },
};
