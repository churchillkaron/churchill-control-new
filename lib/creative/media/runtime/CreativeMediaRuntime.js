import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

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
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `FFMPEG_FAILED_${code}: ${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MEDIA_DOWNLOAD_FAILED_${response.status}`);
  }

  await writeFile(
    target,
    Buffer.from(await response.arrayBuffer()),
  );
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
  const fontFamily =
    typography.font_family ||
    "Arial";
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
      const size = Number(
        overlay.font_size || fontSize,
      );
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

export const CreativeMediaRuntime = {
  async extractContactSheet({
    video_url,
    frame_count = 9,
  } = {}) {
    if (!video_url) throw new Error("video_url required");

    return withWorkspace(
      "avantiqo-video-qa-",
      async (directory) => {
        const input = path.join(directory, "source.mp4");
        const output = path.join(
          directory,
          "contact-sheet.jpg",
        );
        await download(video_url, input);

        const count = Math.max(
          4,
          Math.min(16, Number(frame_count || 9)),
        );
        const columns = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / columns);

        await runFfmpeg([
          "-i", input,
          "-vf",
          `fps=2,scale=480:-2,tile=${columns}x${rows}:nb_frames=${count}:padding=6:margin=6`,
          "-frames:v", "1",
          "-q:v", "2",
          output,
        ]);

        return {
          buffer: await readFile(output),
          content_type: "image/jpeg",
          filename: "video-contact-sheet.jpg",
          frame_count: count,
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

        for (
          let index = 0;
          index < edit_decision_list.length;
          index += 1
        ) {
          const clip = edit_decision_list[index];
          if (!clip.source_url) {
            throw new Error(
              `CLIP_SOURCE_MISSING_${clip.shot_id || index}`,
            );
          }

          const input = path.join(
            directory,
            `input-${index}.mp4`,
          );
          const output = path.join(
            directory,
            `clip-${index}.mp4`,
          );
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
        }

        const concatFile = path.join(
          directory,
          "concat.txt",
        );
        await writeFile(
          concatFile,
          normalized
            .map(
              (file) =>
                `file '${file.replaceAll("'", "'\\''")}'`,
            )
            .join("\n"),
        );

        const finalPath = path.join(
          directory,
          "picture-assembly.mp4",
        );
        await runFfmpeg([
          "-f", "concat",
          "-safe", "0",
          "-i", concatFile,
          "-c", "copy",
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

    const { width, height } = aspectDimensions(
      aspect_ratio,
    );

    return withWorkspace(
      "avantiqo-picture-finish-",
      async (directory) => {
        const input = path.join(directory, "source.mp4");
        const subtitleFile = path.join(
          directory,
          "overlays.ass",
        );
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

        return {
          buffer: await readFile(output),
          content_type: "video/mp4",
          filename:
            `picture-finish-${aspect_ratio.replace(":", "x")}.mp4`,
          width,
          height,
          fps,
          aspect_ratio,
          overlays_applied: overlays.length,
        };
      },
    );
  },
};
