import assert from "node:assert/strict";
import test from "node:test";
import { collectOperatorPresentationArtifacts } from "../lib/operator/runtime/OperatorPresentationArtifactRuntime.js";

test("collects document image video audio and spreadsheet presentation metadata", () => {
  const artifacts = collectOperatorPresentationArtifacts({
    invoice: { label: "Invoice 1001", pdf_url: "/api/invoice/1001", mime_type: "application/pdf", summary: "Invoice preview" },
    image: { title: "Poster", image_url: "storage://creative-assets/poster.png", mime_type: "image/png" },
    video: { title: "Film", final_render_url: "https://cdn.example.test/film.mp4", mime_type: "video/mp4" },
    music: { title: "Master", master_url: "https://cdn.example.test/master.wav", mime_type: "audio/wav" },
    sheet: { name: "Export", download_url: "/api/export.csv", mime_type: "text/csv", rows: [{ Name: "A", Total: 10 }] },
  });
  assert.equal(artifacts.length, 5);
  assert.equal(artifacts.find((item) => item.label === "Master")?.mime_type, "audio/wav");
  assert.deepEqual(artifacts.find((item) => item.label === "Export")?.preview_rows, [{ Name: "A", Total: 10 }]);
  assert.equal(artifacts.find((item) => item.label === "Invoice 1001")?.preview_text, "Invoice preview");
});

test("deduplicates references and rejects unsafe schemes", () => {
  const artifacts = collectOperatorPresentationArtifacts({
    one: { url: "https://cdn.example.test/a.png" },
    two: { preview_url: "https://cdn.example.test/a.png" },
    unsafe: { file_url: "javascript:alert(1)" },
  });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].url, "https://cdn.example.test/a.png");
});
