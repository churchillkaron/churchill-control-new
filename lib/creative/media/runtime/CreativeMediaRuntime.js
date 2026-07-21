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
    const process = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFMPEG_FAILED_${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MEDIA_DOWNLOAD_FAILED_${response.status}`);
  }
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function withWorkspace(prefix, operation) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const CreativeMediaRuntime = {
  async extractContactSheet({ video_url, frame_count = 9 } = {}) {
    if (!video_url) throw new Error("video_url required");

    return withWorkspace("avantiqo-video-qa-", async (directory) => {
      const input = path.join(directory, "source.mp4");
      const output = path.join(directory, "contact-sheet.jpg");
      await download(video_url, input);

      const count = Math.max(4, Math.min(16, Number(frame_count || 9)));
      const columns = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);

      await runFfmpeg([
        "-i", input,
        "-vf", `fps=2,scale=480:-2,tile=${columns}x${rows}:nb_frames=${count}:padding=6:margin=6`,
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
    });
  },

  async composeMaster({ edit_decision_list = [], width = 1920, height = 1080, fps = 30 } = {}) {
    if (!edit_decision_list.length) {
      throw new Error("EDIT_DECISION_LIST_EMPTY");
    }

    return withWorkspace("avantiqo-picture-assembly-", async (directory) => {
      const normalized = [];

      for (let index = 0; index < edit_decision_list.length; index += 1) {
        const clip = edit_decision_list[index];
        if (!clip.source_url) throw new Error(`CLIP_SOURCE_MISSING_${clip.shot_id || index}`);

        const input = path.join(directory, `input-${index}.mp4`);
        const output = path.join(directory, `clip-${index}.mp4`);
        await download(clip.source_url, input);

        const duration = Math.max(0.25, Number(clip.duration_seconds || 0));
        const sourceIn = Math.max(0, Number(clip.source_in_seconds || 0));

        await runFfmpeg([
          "-ss", String(sourceIn),
          "-i", input,
          "-t", String(duration),
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p`,
          "-an",
          "-c:v", "libx264",
          "-preset", "medium",
          "-crf", "18",
          "-movflags", "+faststart",
          output,
        ]);

        normalized.push(output);
      }

      const concatFile = path.join(directory, "concat.txt");
      await writeFile(
        concatFile,
        normalized.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"),
      );

      const finalPath = path.join(directory, "picture-assembly.mp4");
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
    });
  },
};
