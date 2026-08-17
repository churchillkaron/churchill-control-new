import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const CONTRACT = "CREATIVE_MEDIA_BINARY_PREPARE_V1";
const RELEASE = "n8.1.2-1";
const PLATFORM = process.platform;
const ARCH = process.arch;
const TARGET_DIR = path.resolve(process.cwd(), ".avantiqo/bin");
const TARGET_PATH = path.join(TARGET_DIR, "ffmpeg");
const DOWNLOAD_URL = `https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/${RELEASE}/ffmpeg-${PLATFORM}-${ARCH}`;
const EXPECTED_SHA256 = {
  "linux:x64": "9eac5b2b5076db5ff853a6fa0dcd6b8de7d0cac8481eadda6c47cd935825f1ee",
};

function expectedChecksum() {
  return EXPECTED_SHA256[`${PLATFORM}:${ARCH}`] || null;
}

async function checksum(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function existingValid(expected) {
  try {
    const actual = await checksum(TARGET_PATH);
    if (actual !== expected) return false;
    await fs.chmod(TARGET_PATH, 0o755);
    return true;
  } catch {
    return false;
  }
}

async function download(expected) {
  const response = await fetch(DOWNLOAD_URL, {
    redirect: "follow",
    headers: {
      "User-Agent": "Avantiqo-Creative-Build/1.0",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`CREATIVE_MEDIA_FFMPEG_DOWNLOAD_FAILED:${response.status}`);
  }

  await fs.mkdir(TARGET_DIR, { recursive: true });
  const temporaryPath = `${TARGET_PATH}.download`;
  const handle = await fs.open(temporaryPath, "w");
  try {
    await pipeline(Readable.fromWeb(response.body), handle.createWriteStream());
  } finally {
    await handle.close().catch(() => {});
  }

  const actual = await checksum(temporaryPath);
  if (actual !== expected) {
    await fs.rm(temporaryPath, { force: true });
    throw new Error(`CREATIVE_MEDIA_FFMPEG_CHECKSUM_MISMATCH:${actual}`);
  }
  await fs.chmod(temporaryPath, 0o755);
  await fs.rename(temporaryPath, TARGET_PATH);
}

// A platform with no pinned binary falls back to whatever ffmpeg the machine already has.
//
// Only linux:x64 is pinned, which is what production runs, so on Apple silicon this step threw
// CREATIVE_MEDIA_FFMPEG_PLATFORM_UNSUPPORTED:darwin:arm64 and took the whole build with it -- prebuild runs
// this first, so npm run build could not complete locally at all.
//
// The fix is deliberately not a second pinned checksum. The value of pinning is that production runs a
// binary whose hash was decided in advance; a hash I produce by downloading the file myself and hashing
// whatever arrives verifies nothing except that the download did not corrupt. So production keeps the single
// verified binary and nothing about that path changes, while a developer machine uses the ffmpeg already
// installed on it. The runtime resolves its binary from CREATIVE_MEDIA_FFMPEG_PATH, so pointing at the
// system one is the supported arrangement rather than a workaround.
async function systemFfmpeg() {
  const candidates = [
    process.env.CREATIVE_MEDIA_FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

async function main() {
  const expected = expectedChecksum();
  if (!expected) {
    const fallback = await systemFfmpeg();
    if (!fallback) {
      throw new Error(
        `CREATIVE_MEDIA_FFMPEG_PLATFORM_UNSUPPORTED:${PLATFORM}:${ARCH}` +
        " -- no pinned binary for this platform and no ffmpeg found on the system." +
        " Install ffmpeg, or set CREATIVE_MEDIA_FFMPEG_PATH to one.",
      );
    }
    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      platform: PLATFORM,
      arch: ARCH,
      source: "SYSTEM_FFMPEG",
      target: fallback,
      pinned: false,
      note:
        "No pinned binary for this platform, so the system ffmpeg is used. Production runs linux:x64," +
        " where the pinned checksum-verified binary is still the only one accepted.",
    }));
    return;
  }

  if (!(await existingValid(expected))) {
    await download(expected);
  }

  const actual = await checksum(TARGET_PATH);
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    release: RELEASE,
    platform: PLATFORM,
    arch: ARCH,
    target: ".avantiqo/bin/ffmpeg",
    sha256: actual,
  }));
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
