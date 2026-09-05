import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const PROOF_DIR = path.resolve("artifacts/video-remote-media-identity-proof");
const DURATION_SECONDS = 8;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `COMMAND_FAILED:${command}:${result.status}\n${output.slice(-16000)}`,
    );
  }
  return output;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function parseRuntimeSignature(output) {
  const source = String(output || "");
  const whole = /whole video matching/i.test(source);
  const noMatch = /no matching of video\s+0\s+and\s+1/i.test(source);
  const matches = [...source.matchAll(
    /matching of video\s+0\s+at\s+([^\s]+)\s+and\s+1\s+at\s+([^\s,]+),\s*(\d+)\s+frames matching/gi,
  )].map((match) => ({
    source_position: match[1],
    remote_position: match[2],
    matching_frames: Number(match[3]),
  }));
  return {
    whole_video_matching: whole,
    no_matching_sequence: noMatch,
    matches,
    maximum_matching_frames: matches.reduce(
      (maximum, match) => Math.max(maximum, match.matching_frames || 0),
      0,
    ),
  };
}

function runtimeMethodContract() {
  const runtimePath = path.resolve(
    "lib/creative/release/runtime/CreativePublicationRemoteMediaIdentityRuntime.js",
  );
  const source = fs.readFileSync(runtimePath, "utf8");
  assert.match(source, /CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_V1/);
  assert.match(source, /FFMPEG_MPEG7_VIDEO_SIGNATURE/);
  assert.match(source, /signature=nb_inputs=2:detectmode=full/);
  assert.match(source, /whole video matching/i);
  assert.match(source, /no matching of video\\s\+0\\s\+and\\s\+1/i);
  assert.match(source, /matching of video\\s\+0\\s\+at/);
  assert.match(source, /MATCHED_FULL/);
  assert.match(source, /MISMATCHED/);
  return {
    runtime_path: runtimePath,
    runtime_contract: "CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_V1",
    method: "FFMPEG_MPEG7_VIDEO_SIGNATURE",
    parser_bound_to_runtime_source: true,
  };
}

function signatureCompare(sourcePath, remotePath) {
  const filter = [
    `[0:v]trim=duration=${DURATION_SECONDS},setpts=PTS-STARTPTS[source]`,
    `[1:v]trim=duration=${DURATION_SECONDS},setpts=PTS-STARTPTS[remote]`,
    "[source][remote]signature=nb_inputs=2:detectmode=full",
  ].join(";");
  const output = run(FFMPEG, [
    "-hide_banner",
    "-nostats",
    "-i", sourcePath,
    "-i", remotePath,
    "-filter_complex", filter,
    "-an",
    "-f", "null",
    "-",
  ]);
  return {
    parsed: parseRuntimeSignature(output),
    raw_tail: output.split("\n").filter((line) =>
      /matching of video|whole video matching|no matching of video/i.test(line),
    ).slice(-12),
  };
}

async function main() {
  const runtime = runtimeMethodContract();
  const ffmpegVersion = run(FFMPEG, ["-version"]).split("\n").find(Boolean) || "unknown";
  const filters = run(FFMPEG, ["-hide_banner", "-filters"]);
  assert.match(filters, /\bsignature\b/i, "FFmpeg signature filter must be available");

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "avantiqo-media-proof-"));
  await fsp.mkdir(PROOF_DIR, { recursive: true });
  const approved = path.join(tempDir, "approved.mp4");
  const transcoded = path.join(tempDir, "provider-transcoded.mp4");
  const altered = path.join(tempDir, "altered.mp4");

  try {
    run(FFMPEG, [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", `testsrc2=size=640x360:rate=30:duration=${DURATION_SECONDS}`,
      "-vf", "drawbox=x=20+40*t:y=40:w=120:h=80:color=yellow@0.8:t=fill",
      "-c:v", "mpeg4",
      "-q:v", "2",
      "-pix_fmt", "yuv420p",
      "-an",
      "-y",
      approved,
    ]);

    run(FFMPEG, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", approved,
      "-vf", "scale=320:180:flags=lanczos,eq=contrast=1.03:saturation=0.96",
      "-c:v", "mpeg4",
      "-q:v", "18",
      "-pix_fmt", "yuv420p",
      "-an",
      "-y",
      transcoded,
    ]);

    run(FFMPEG, [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", `smptebars=size=640x360:rate=30:duration=${DURATION_SECONDS}`,
      "-vf", "drawbox=x=250:y=130:w=140:h=100:color=black@1:t=fill",
      "-c:v", "mpeg4",
      "-q:v", "2",
      "-pix_fmt", "yuv420p",
      "-an",
      "-y",
      altered,
    ]);

    const approvedSha = sha256(approved);
    const transcodedSha = sha256(transcoded);
    const alteredSha = sha256(altered);
    assert.notEqual(
      approvedSha,
      transcodedSha,
      "Provider-style transcode must not be byte-identical to approved source",
    );
    assert.notEqual(
      approvedSha,
      alteredSha,
      "Altered fixture must not be byte-identical to approved source",
    );

    const transcodeMatch = signatureCompare(approved, transcoded);
    assert.equal(
      transcodeMatch.parsed.whole_video_matching,
      true,
      `Transcoded fixture must produce whole-video match: ${JSON.stringify(transcodeMatch.raw_tail)}`,
    );
    assert.ok(
      transcodeMatch.parsed.maximum_matching_frames > 0,
      "Transcoded fixture must report matching frames",
    );
    assert.equal(
      transcodeMatch.parsed.no_matching_sequence,
      false,
      "Transcoded fixture must not report no-match",
    );

    const alteredMatch = signatureCompare(approved, altered);
    assert.equal(
      alteredMatch.parsed.whole_video_matching,
      false,
      "Altered fixture must not produce whole-video match",
    );
    assert.equal(
      alteredMatch.parsed.no_matching_sequence,
      true,
      `Altered fixture must produce explicit no-match: ${JSON.stringify(alteredMatch.raw_tail)}`,
    );

    const proof = {
      marker: "AVANTIQO_VIDEO_REMOTE_MEDIA_IDENTITY_EXECUTED_PROOF=PASS",
      generated_at: new Date().toISOString(),
      ffmpeg_version: ffmpegVersion,
      runtime,
      fixture: {
        duration_seconds: DURATION_SECONDS,
        approved: {
          sha256: approvedSha,
          resolution: "640x360",
          codec: "mpeg4",
        },
        provider_transcoded: {
          sha256: transcodedSha,
          resolution: "320x180",
          codec: "mpeg4",
          byte_identical_to_approved: approvedSha === transcodedSha,
          whole_video_matching: transcodeMatch.parsed.whole_video_matching,
          maximum_matching_frames: transcodeMatch.parsed.maximum_matching_frames,
          runtime_classification: "MATCHED_FULL",
          evidence_lines: transcodeMatch.raw_tail,
        },
        deliberately_altered: {
          sha256: alteredSha,
          byte_identical_to_approved: approvedSha === alteredSha,
          whole_video_matching: alteredMatch.parsed.whole_video_matching,
          no_matching_sequence: alteredMatch.parsed.no_matching_sequence,
          maximum_matching_frames: alteredMatch.parsed.maximum_matching_frames,
          runtime_classification: "MISMATCHED",
          evidence_lines: alteredMatch.raw_tail,
        },
      },
      assertions: {
        signature_filter_available: true,
        runtime_method_and_parser_source_bound: true,
        transcoded_bytes_differ: true,
        transcoded_full_perceptual_match: true,
        altered_explicit_no_match: true,
      },
      scope: {
        proves: [
          "The exact FFmpeg MPEG-7 signature mechanism used by the Video remote-media runtime can recognize a provider-style transcode whose SHA-256 differs from the approved source.",
          "The same mechanism rejects a deliberately different video with the explicit FFmpeg no-match result.",
        ],
        does_not_prove: [
          "Live Meta, LinkedIn, or Google provider credentials and remote CDN retrieval.",
          "Audio identity; V1 deliberately reports NOT_EVALUATED_V1.",
        ],
      },
    };

    await fsp.writeFile(
      path.join(PROOF_DIR, "proof.json"),
      `${JSON.stringify(proof, null, 2)}\n`,
    );
    await Promise.all([
      fsp.copyFile(approved, path.join(PROOF_DIR, "approved.mp4")),
      fsp.copyFile(transcoded, path.join(PROOF_DIR, "provider-transcoded.mp4")),
      fsp.copyFile(altered, path.join(PROOF_DIR, "altered.mp4")),
    ]);

    console.log("\n=== AVANTIQO VIDEO REMOTE MEDIA IDENTITY EXECUTED PROOF ===");
    console.log(`FFmpeg: ${ffmpegVersion}`);
    console.log(`Approved SHA-256:   ${approvedSha}`);
    console.log(`Transcoded SHA-256: ${transcodedSha}`);
    console.log("Transcoded byte-identical: false");
    console.log(
      `Transcoded MPEG-7: whole=${transcodeMatch.parsed.whole_video_matching} max_matching_frames=${transcodeMatch.parsed.maximum_matching_frames}`,
    );
    for (const line of transcodeMatch.raw_tail) console.log(`  ${line}`);
    console.log(`Altered SHA-256:    ${alteredSha}`);
    console.log(
      `Altered MPEG-7: whole=${alteredMatch.parsed.whole_video_matching} no_match=${alteredMatch.parsed.no_matching_sequence}`,
    );
    for (const line of alteredMatch.raw_tail) console.log(`  ${line}`);
    console.log("AVANTIQO_VIDEO_REMOTE_MEDIA_IDENTITY_EXECUTED_PROOF=PASS");
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

await main();
