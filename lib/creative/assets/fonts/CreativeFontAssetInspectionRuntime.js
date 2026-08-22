import crypto from "node:crypto";

const CONTRACT = "CREATIVE_FONT_ASSET_INSPECTION_V1";
const MAX_FONT_BYTES = 64 * 1024 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

async function bytesFrom(file) {
  if (!file) throw new Error("CREATIVE_FONT_FILE_REQUIRED");
  if (Buffer.isBuffer(file)) return file;
  if (file instanceof Uint8Array) return Buffer.from(file);
  if (typeof file.arrayBuffer === "function") {
    return Buffer.from(await file.arrayBuffer());
  }
  if (file.buffer) return Buffer.from(file.buffer);
  throw new Error("CREATIVE_FONT_FILE_PAYLOAD_UNSUPPORTED");
}

function u16(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) {
    throw new Error("CREATIVE_FONT_BINARY_TRUNCATED");
  }
  return buffer.readUInt16BE(offset);
}

function u32(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new Error("CREATIVE_FONT_BINARY_TRUNCATED");
  }
  return buffer.readUInt32BE(offset);
}

function ascii(buffer, offset, length) {
  if (offset < 0 || offset + length > buffer.length) {
    throw new Error("CREATIVE_FONT_BINARY_TRUNCATED");
  }
  return buffer.toString("ascii", offset, offset + length);
}

function fontFormat(buffer) {
  if (buffer.length < 12) throw new Error("CREATIVE_FONT_BINARY_TOO_SMALL");
  const signature = ascii(buffer, 0, 4);
  if (buffer.readUInt32BE(0) === 0x00010000 || signature === "true") return "TTF";
  if (signature === "OTTO") return "OTF";
  if (signature === "wOFF") return "WOFF";
  if (signature === "wOF2") return "WOFF2";
  throw new Error("CREATIVE_FONT_BINARY_SIGNATURE_INVALID");
}

function decodeUtf16Be(buffer) {
  if (buffer.length % 2 !== 0) return null;
  const swapped = Buffer.alloc(buffer.length);
  for (let index = 0; index < buffer.length; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }
  return swapped.toString("utf16le").replace(/\u0000/g, "").trim();
}

function decodeName(buffer, platformId, encodingId) {
  if (platformId === 0 || platformId === 3) return decodeUtf16Be(buffer);
  if (platformId === 1 && [0, 1].includes(encodingId)) {
    return buffer.toString("latin1").replace(/\u0000/g, "").trim();
  }
  return null;
}

function sfntNameTable(buffer) {
  const numTables = u16(buffer, 4);
  const directoryEnd = 12 + numTables * 16;
  if (directoryEnd > buffer.length) throw new Error("CREATIVE_FONT_TABLE_DIRECTORY_INVALID");

  for (let index = 0; index < numTables; index += 1) {
    const offset = 12 + index * 16;
    if (ascii(buffer, offset, 4) !== "name") continue;
    const tableOffset = u32(buffer, offset + 8);
    const tableLength = u32(buffer, offset + 12);
    if (tableOffset + tableLength > buffer.length || tableLength < 6) {
      throw new Error("CREATIVE_FONT_NAME_TABLE_INVALID");
    }
    return { offset: tableOffset, length: tableLength };
  }
  throw new Error("CREATIVE_FONT_NAME_TABLE_REQUIRED");
}

function parseSfntNames(buffer) {
  const table = sfntNameTable(buffer);
  const count = u16(buffer, table.offset + 2);
  const stringOffset = u16(buffer, table.offset + 4);
  const recordStart = table.offset + 6;
  const storageStart = table.offset + stringOffset;
  if (recordStart + count * 12 > table.offset + table.length) {
    throw new Error("CREATIVE_FONT_NAME_RECORDS_INVALID");
  }

  const candidates = new Map();
  for (let index = 0; index < count; index += 1) {
    const record = recordStart + index * 12;
    const platformId = u16(buffer, record);
    const encodingId = u16(buffer, record + 2);
    const languageId = u16(buffer, record + 4);
    const nameId = u16(buffer, record + 6);
    const length = u16(buffer, record + 8);
    const offset = u16(buffer, record + 10);
    const start = storageStart + offset;
    const end = start + length;
    if (start < storageStart || end > table.offset + table.length) continue;
    const value = decodeName(buffer.subarray(start, end), platformId, encodingId);
    if (!text(value)) continue;
    const priority = platformId === 3
      ? (languageId === 0x0409 ? 100 : 90)
      : platformId === 0
        ? 80
        : 50;
    const prior = candidates.get(nameId);
    if (!prior || priority > prior.priority) candidates.set(nameId, { value, priority });
  }

  return {
    family: candidates.get(1)?.value || candidates.get(16)?.value || null,
    style: candidates.get(2)?.value || candidates.get(17)?.value || null,
    full_name: candidates.get(4)?.value || null,
    postscript_name: candidates.get(6)?.value || null,
  };
}

function inferWeight(style) {
  const value = text(style).toLowerCase();
  if (!value) return null;
  if (/thin|hairline/.test(value)) return 100;
  if (/extra\s*light|ultra\s*light/.test(value)) return 200;
  if (/light/.test(value)) return 300;
  if (/medium/.test(value)) return 500;
  if (/semi\s*bold|demi\s*bold/.test(value)) return 600;
  if (/extra\s*bold|ultra\s*bold/.test(value)) return 800;
  if (/black|heavy/.test(value)) return 900;
  if (/bold/.test(value)) return 700;
  if (/regular|normal|book|roman/.test(value)) return 400;
  return null;
}

export async function inspectCreativeFontAsset({ file } = {}) {
  const buffer = await bytesFrom(file);
  if (!buffer.length) throw new Error("CREATIVE_FONT_FILE_EMPTY");
  if (buffer.length > MAX_FONT_BYTES) throw new Error("CREATIVE_FONT_FILE_TOO_LARGE");

  const format = fontFormat(buffer);
  if (["WOFF", "WOFF2"].includes(format)) {
    throw new Error(`CREATIVE_FONT_FORMAT_METADATA_NOT_CERTIFIED:${format}`);
  }

  const names = parseSfntNames(buffer);
  if (!text(names.family)) throw new Error("CREATIVE_FONT_FAMILY_REQUIRED");
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    success: true,
    contract: CONTRACT,
    format,
    family: names.family,
    style: names.style || "Regular",
    full_name: names.full_name || `${names.family} ${names.style || "Regular"}`.trim(),
    postscript_name: names.postscript_name,
    weight: inferWeight(names.style) || 400,
    byte_length: buffer.length,
    checksum_sha256: checksum,
    binary_valid: true,
    metadata_verified_from_font_binary: true,
    visual_ai_analysis_used: false,
    provider_called: false,
  };
}

export const CreativeFontAssetInspectionRuntime = Object.freeze({
  contract: CONTRACT,
  certified_formats: Object.freeze(["TTF", "OTF"]),
  inspect: inspectCreativeFontAsset,
});
