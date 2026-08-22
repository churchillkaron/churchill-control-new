import { test } from "node:test";
import assert from "node:assert/strict";

import {
  inspectCreativeFontAsset,
} from "../lib/creative/assets/fonts/CreativeFontAssetInspectionRuntime.js";

function utf16be(value) {
  const le = Buffer.from(String(value), "utf16le");
  const be = Buffer.alloc(le.length);
  for (let index = 0; index < le.length; index += 2) {
    be[index] = le[index + 1];
    be[index + 1] = le[index];
  }
  return be;
}

function createMinimalTrueType() {
  const values = [
    [1, "Avantiqo Test Sans"],
    [2, "SemiBold"],
    [4, "Avantiqo Test Sans SemiBold"],
    [6, "AvantiqoTestSans-SemiBold"],
  ];
  const encoded = values.map(([nameId, value]) => [nameId, utf16be(value)]);
  const recordBytes = encoded.length * 12;
  const storageBytes = encoded.reduce((sum, [, bytes]) => sum + bytes.length, 0);
  const nameLength = 6 + recordBytes + storageBytes;
  const nameOffset = 12 + 16;
  const buffer = Buffer.alloc(nameOffset + nameLength);

  buffer.writeUInt32BE(0x00010000, 0);
  buffer.writeUInt16BE(1, 4);
  buffer.writeUInt16BE(16, 6);
  buffer.writeUInt16BE(0, 8);
  buffer.writeUInt16BE(0, 10);

  buffer.write("name", 12, 4, "ascii");
  buffer.writeUInt32BE(0, 16);
  buffer.writeUInt32BE(nameOffset, 20);
  buffer.writeUInt32BE(nameLength, 24);

  buffer.writeUInt16BE(0, nameOffset);
  buffer.writeUInt16BE(encoded.length, nameOffset + 2);
  buffer.writeUInt16BE(6 + recordBytes, nameOffset + 4);

  let stringCursor = 0;
  encoded.forEach(([nameId, bytes], index) => {
    const record = nameOffset + 6 + index * 12;
    buffer.writeUInt16BE(3, record);
    buffer.writeUInt16BE(1, record + 2);
    buffer.writeUInt16BE(0x0409, record + 4);
    buffer.writeUInt16BE(nameId, record + 6);
    buffer.writeUInt16BE(bytes.length, record + 8);
    buffer.writeUInt16BE(stringCursor, record + 10);
    bytes.copy(buffer, nameOffset + 6 + recordBytes + stringCursor);
    stringCursor += bytes.length;
  });

  return buffer;
}

test("font inspector extracts exact family and style from TTF binary", async () => {
  const result = await inspectCreativeFontAsset({ file: createMinimalTrueType() });
  assert.equal(result.success, true);
  assert.equal(result.contract, "CREATIVE_FONT_ASSET_INSPECTION_V1");
  assert.equal(result.format, "TTF");
  assert.equal(result.family, "Avantiqo Test Sans");
  assert.equal(result.style, "SemiBold");
  assert.equal(result.full_name, "Avantiqo Test Sans SemiBold");
  assert.equal(result.postscript_name, "AvantiqoTestSans-SemiBold");
  assert.equal(result.weight, 600);
  assert.equal(result.binary_valid, true);
  assert.equal(result.metadata_verified_from_font_binary, true);
  assert.equal(result.visual_ai_analysis_used, false);
  assert.equal(result.provider_called, false);
  assert.match(result.checksum_sha256, /^[a-f0-9]{64}$/);
});

test("font inspector fails closed on invalid font binary", async () => {
  await assert.rejects(
    inspectCreativeFontAsset({ file: Buffer.from("not-a-font") }),
    /CREATIVE_FONT_BINARY/,
  );
});

test("WOFF metadata extraction is not falsely certified", async () => {
  const woff = Buffer.alloc(44);
  woff.write("wOFF", 0, 4, "ascii");
  await assert.rejects(
    inspectCreativeFontAsset({ file: woff }),
    /CREATIVE_FONT_FORMAT_METADATA_NOT_CERTIFIED:WOFF/,
  );
});
