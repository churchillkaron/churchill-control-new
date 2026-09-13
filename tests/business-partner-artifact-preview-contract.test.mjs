import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const artifacts = await readFile(
  new URL("../components/operator/OperatorExecutionArtifacts.jsx", import.meta.url),
  "utf8",
);

test("Business Partner recognizes universal artifact URLs and media types", () => {
  for (const key of [
    "preview_url",
    "pdf_url",
    "receipt_url",
    "download_url",
    "image_url",
    "video_url",
    "audio_url",
    "storage_reference",
  ]) {
    assert.match(artifacts, new RegExp(`\\"${key}\\"`));
  }

  for (const kind of ["image", "video", "audio", "document", "spreadsheet"]) {
    assert.match(artifacts, new RegExp(`return \\"${kind}\\"`));
  }
});

test("Business Partner artifact previews stay visible and downloadable", () => {
  assert.match(artifacts, /data-avantiqo-universal-preview="true"/);
  assert.match(artifacts, /<iframe src=\{artifact\.url\}/);
  assert.match(artifacts, /<video src=\{artifact\.url\}/);
  assert.match(artifacts, /<audio src=\{artifact\.url\}/);
  assert.match(artifacts, /href=\{artifact\.url\} download/);
  assert.match(artifacts, /Spreadsheet preview data is not embedded in this result yet/);
});

test("Artifact preview working text respects the 11px readability floor", () => {
  assert.doesNotMatch(artifacts, /text-\[(?:6|7|8|9|10)px\]/);
  assert.match(artifacts, /text-\[11px\]/);
});
