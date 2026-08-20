import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const CONTRACT = "CREATIVE_MEDIA_BINARY_PREPARE_V2";
const RELEASE = "n8.1.2-1";
const PLATFORM = process.platform;
const ARCH = process.arch;
const TARGET_DIR = path.resolve(process.cwd(), ".avantiqo/bin");

const BINARIES = {
  ffmpeg: {
    target: path.join(TARGET_DIR, "ffmpeg"),
    url: `https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/${RELEASE}/ffmpeg-${PLATFORM}-${ARCH}`,
    checksums: {
      "linux:x64": {
        algorithm: "sha256",
        value: "9eac5b2b5076db5ff853a6fa0dcd6b8de7d0cac8481eadda6c47cd935825f1ee",
      },
    },
  },
  ffprobe: {
    target: path.join(TARGET_DIR, "ffprobe"),
    url: `https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/${RELEASE}/ffprobe-${PLATFORM}-${ARCH}`,
    checksums: {
      "linux:x64": {
        algorithm: "md5",
        value: "1f4a239658ac982f7fe08c5e90a9b50e",
      },
    },
  },
};

function checksumPolicy(binary) {
  return binary.checksums[`${PLATFORM}:${ARCH}`] || null;
}

async function checksum(filePath, algorithm) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash(algorithm).update(buffer).digest("hex");
}

async function existingValid(binary, expected) {
  try {
    const actual = await checksum(binary.target, expected.algorithm);
    if (actual !== expected.value) return false;
    await fs.chmod(binary.target, 0o755);
    return true;
  } catch {
    return false;
  }
}

async function download(binary, expected) {
  const response = await fetch(binary.url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Avantiqo-Creative-Build/2.0",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`CREATIVE_MEDIA_BINARY_DOWNLOAD_FAILED:${response.status}`);
  }

  await fs.mkdir(TARGET_DIR, { recursive: true });
  const temporaryPath = `${binary.target}.download`;
  const handle = await fs.open(temporaryPath, "w");
  try {
    await pipeline(Readable.fromWeb(response.body), handle.createWriteStream());
  } finally {
    await handle.close().catch(() => {});
  }

  const actual = await checksum(temporaryPath, expected.algorithm);
  if (actual !== expected.value) {
    await fs.rm(temporaryPath, { force: true });
    throw new Error(
      `CREATIVE_MEDIA_BINARY_CHECKSUM_MISMATCH:${path.basename(binary.target)}:${actual}`,
    );
  }
  await fs.chmod(temporaryPath, 0o755);
  await fs.rename(temporaryPath, binary.target);
}

async function systemBinary(name) {
  const envName = name === "ffprobe"
    ? "CREATIVE_MEDIA_FFPROBE_PATH"
    : "CREATIVE_MEDIA_FFMPEG_PATH";
  const candidates = [
    process.env[envName],
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
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

async function prepare(name, binary) {
  const expected = checksumPolicy(binary);
  if (!expected) {
    const fallback = await systemBinary(name);
    if (!fallback) {
      throw new Error(
        `CREATIVE_MEDIA_${name.toUpperCase()}_PLATFORM_UNSUPPORTED:${PLATFORM}:${ARCH}` +
        ` -- no pinned binary for this platform and no ${name} found on the system.`,
      );
    }
    return {
      name,
      source: "SYSTEM_BINARY",
      target: fallback,
      pinned: false,
    };
  }

  if (!(await existingValid(binary, expected))) {
    await download(binary, expected);
  }

  return {
    name,
    source: "PINNED_RELEASE_BINARY",
    target: path.relative(process.cwd(), binary.target),
    pinned: true,
    checksum_algorithm: expected.algorithm,
    checksum: await checksum(binary.target, expected.algorithm),
  };
}

async function main() {
  const prepared = [];
  for (const [name, binary] of Object.entries(BINARIES)) {
    prepared.push(await prepare(name, binary));
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    release: RELEASE,
    platform: PLATFORM,
    arch: ARCH,
    binaries: prepared,
  }));
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
