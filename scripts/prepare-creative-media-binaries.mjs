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
  "linux:x64": "9eac5b2b8ab1070962d1e7909b8dcbbbedcbf0bd3cd08ef1d23bcd264fdcf1ee",
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
  await pipeline(Readable.fromWeb(response.body), await fs.open(temporaryPath, "w").then((handle) => handle.createWriteStream()));
  const actual = await checksum(temporaryPath);
  if (actual !== expected) {
    await fs.rm(temporaryPath, { force: true });
    throw new Error(`CREATIVE_MEDIA_FFMPEG_CHECKSUM_MISMATCH:${actual}`);
  }
  await fs.chmod(temporaryPath, 0o755);
  await fs.rename(temporaryPath, TARGET_PATH);
}

async function main() {
  const expected = expectedChecksum();
  if (!expected) {
    throw new Error(`CREATIVE_MEDIA_FFMPEG_PLATFORM_UNSUPPORTED:${PLATFORM}:${ARCH}`);
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
