import assert from "node:assert/strict";

import {
  AVANTIQO_FONT_LIBRARY,
  CreativeFontLibraryRegistry,
} from "../lib/creative/design/registry/CreativeFontLibraryRegistry.js";
import {
  inspectCreativeFontAsset,
} from "../lib/creative/assets/fonts/CreativeFontAssetInspectionRuntime.js";

const API_BASE = "https://api.github.com/repos/google/fonts/contents";

function chooseUprightTtf(entries = []) {
  const fonts = entries.filter(
    (entry) => entry?.type === "file" && /\.ttf$/i.test(entry.name || ""),
  );
  const upright = fonts.filter((entry) => !/italic/i.test(entry.name || ""));
  return (
    upright.find((entry) => /\[[^\]]*wght[^\]]*\]\.ttf$/i.test(entry.name || "")) ||
    upright.find((entry) => /regular\.ttf$/i.test(entry.name || "")) ||
    upright.sort((a, b) => String(a.name).localeCompare(String(b.name)))[0] ||
    null
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Avantiqo-Font-Certification/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  assert.equal(response.ok, true, `HTTP ${response.status} for ${url}`);
  return response.json();
}

async function certifyFamily(entry) {
  const directoryUrl = `${API_BASE}/${entry.source.directory}?ref=${entry.source.revision}`;
  const listing = await fetchJson(directoryUrl);
  assert.equal(Array.isArray(listing), true, `${entry.family}: directory listing required`);

  const license = listing.find((file) => file.name === "OFL.txt" && file.type === "file");
  assert.ok(license, `${entry.family}: OFL.txt missing`);
  assert.equal(entry.license.id, "OFL-1.1", `${entry.family}: unexpected license id`);
  assert.equal(entry.license.verified, true, `${entry.family}: license must be verified`);

  const font = chooseUprightTtf(listing);
  assert.ok(font, `${entry.family}: upright TTF missing`);
  assert.ok(font.download_url, `${entry.family}: immutable download URL missing`);
  assert.ok(
    String(font.download_url).includes(entry.source.revision),
    `${entry.family}: font URL must be pinned to registry revision`,
  );

  const response = await fetch(font.download_url, {
    headers: { "User-Agent": "Avantiqo-Font-Certification/1.0" },
  });
  assert.equal(response.ok, true, `${entry.family}: font download failed ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1024, `${entry.family}: font binary unexpectedly small`);
  const inspection = await inspectCreativeFontAsset({ file: bytes });
  assert.equal(inspection.binary_valid, true, `${entry.family}: invalid font binary`);
  assert.match(inspection.checksum_sha256, /^[a-f0-9]{64}$/);

  return {
    id: entry.id,
    family: entry.family,
    upstream_path: font.path,
    bytes: bytes.length,
    checksum_sha256: inspection.checksum_sha256,
    inspected_family: inspection.family,
    inspected_style: inspection.style,
    license: entry.license.id,
  };
}

assert.equal(CreativeFontLibraryRegistry.family_count, 32);
assert.equal(AVANTIQO_FONT_LIBRARY.length, 32);
assert.equal(new Set(AVANTIQO_FONT_LIBRARY.map((entry) => entry.id)).size, 32);
assert.equal(new Set(AVANTIQO_FONT_LIBRARY.map((entry) => entry.family)).size, 32);

const results = [];
for (const entry of AVANTIQO_FONT_LIBRARY) {
  results.push(await certifyFamily(entry));
}

const thai = AVANTIQO_FONT_LIBRARY.filter((entry) => entry.scripts.includes("thai"));
assert.ok(thai.length >= 5, "Thai/Latin font coverage must remain present");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_FONT_LIBRARY_LIVE_CERTIFICATION_V1",
  upstream_repository: CreativeFontLibraryRegistry.upstream_repository,
  upstream_revision: CreativeFontLibraryRegistry.upstream_revision,
  family_count: results.length,
  thai_family_count: thai.length,
  families: results,
}, null, 2));
