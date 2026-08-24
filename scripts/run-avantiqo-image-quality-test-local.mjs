import fs from "node:fs";
import { spawnSync } from "node:child_process";

const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const FIXTURE_PATH =
  process.env.AVANTIQO_MEDIA_CERTIFICATION_FIXTURES ||
  "/tmp/avantiqo-media-certification-fixtures.json";
const QUALITY_FOUNDATION_MODEL = "Qwen/Qwen-Image-2512";
const HUMAN_RESTAURANT_INSTRUCTION = [
  "Create a photorealistic high-end restaurant advertising photograph captured during a real dinner service.",
  "The main subject is a natural-looking adult female restaurant manager in her early 30s standing beside a dining table, warmly presenting a plated dinner to two seated adult guests.",
  "Preserve the successful human realism from a professional candid hospitality photograph: realistic skin texture and pores, natural facial asymmetry, believable eyes and teeth, subtle expression lines, coherent hands and ordinary body proportions, with no waxy or synthetic AI appearance.",
  "Both of the manager's hands must be fully visible and anatomically correct with exactly five natural fingers on each hand; one hand supports the plate naturally while the other gestures toward the food without posing for the camera.",
  "The guests are engaged in natural conversation with coherent faces, hands, body proportions and eye lines; they should look like real diners caught during service rather than symmetrical advertising models.",
  "The hero dish must look like food that was actually cooked and plated in a real restaurant, not a CGI food render or stylized fine-dining sculpture.",
  "Use a normal 27 to 29 centimetre white dinner plate and a believable approximately 180 gram beef tenderloin portion, correctly scaled for one person and not oversized.",
  "The beef must have irregular natural geometry, a dry dark-brown pan-seared crust with small variations in char, visible meat grain and fibres, tiny surface cracks, rendered fat and natural cooking juices; it must not look like a perfect cube, polished resin, lacquered plastic or a molded block.",
  "If the beef is cut, show only one natural knife cut exposing a moist medium-rare interior with realistic fibrous texture and a gradual cooked-to-pink transition; do not show an impossible raw pink exterior wall.",
  "Serve it with a small spooned portion of rustic potato puree showing subtle texture and soft irregular edges, three or four naturally roasted asparagus spears with slight browning and varied shapes, and only a few herbs placed casually rather than geometrically.",
  "Use a restrained brown-red wine jus in a thin irregular spooned pool with translucent edges and natural viscosity; avoid bright burgundy syrup, mirror gloss, perfect circles, excessive sauce, decorative swirls or artificial shine.",
  "Food highlights must come from real moisture, butter and cooking juices, not plastic gloss. Include tiny believable imperfections such as uneven sear marks, crumbs, slight sauce variation and non-identical vegetable shapes while keeping the plate appetizing and professionally presented.",
  "The environment is an elegant contemporary restaurant with dark walnut, warm brass details, linen table settings, subtle glassware reflections and a softly populated background with other diners.",
  "Lighting is warm practical restaurant light mixed with a soft directional key from camera left; retain realistic shadow direction, neutral skin tones, controlled glass reflections and physically plausible food highlights without orange oversaturation.",
  "Camera is at normal standing eye level, not overhead, using a full-frame 50mm lens at approximately f/2.8 with shallow but believable depth of field; the manager and plate are crisp while the background falls off naturally.",
  "Composition should feel like a world-class hospitality campaign photographed during genuine service: candid, expensive and authentic, with the plate important but not unnaturally enlarged toward the camera.",
  "No text, no logo, no watermark, no extra limbs, no extra fingers, no fused hands, no duplicate people, no floating cutlery, no impossible table geometry, no plastic skin, no plastic food, no wax food, no sculpted food, no perfect geometric steak, no artificial food gloss, no excessive cinematic haze, no illustration and no CGI look.",
].join(" ");

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function runNode(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`AVANTIQO_IMAGE_QUALITY_CHILD_SIGNAL:${result.signal}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

async function resolveImageEndpointId() {
  const configured = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configured) {
    console.log("AVANTIQO_IMAGE_QUALITY_ENDPOINT_RESOLUTION=ENV");
    return configured;
  }

  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const response = await fetch(
    `${RUNPOD_REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`AVANTIQO_IMAGE_QUALITY_ENDPOINT_LOOKUP_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (!Array.isArray(body)) throw new Error("AVANTIQO_IMAGE_QUALITY_ENDPOINT_LIST_INVALID");

  const matches = body.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_QUALITY_ENDPOINT_AUTO_RESOLUTION_FAILED:name=${IMAGE_ENDPOINT_NAME}:matches=${matches.length}`,
    );
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("AVANTIQO_IMAGE_QUALITY_ENDPOINT_ID_MISSING");

  console.log("AVANTIQO_IMAGE_QUALITY_ENDPOINT_RESOLUTION=EXACT_NAME");
  console.log(`AVANTIQO_IMAGE_QUALITY_ENDPOINT_NAME=${IMAGE_ENDPOINT_NAME}`);
  console.log("AVANTIQO_IMAGE_QUALITY_ENDPOINT_SECRET_PRINTED=false");
  return endpointId;
}

if (!fs.existsSync(".env.local")) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_TEST_ENV_LOCAL_REQUIRED");
}

const imageEndpointId = await resolveImageEndpointId();

console.log("AVANTIQO_IMAGE_QUALITY_SCENARIO=HUMAN_RESTAURANT_FOOD_REALISM_RETEST");
console.log(`AVANTIQO_IMAGE_QUALITY_FOUNDATION=${QUALITY_FOUNDATION_MODEL}`);
console.log("AVANTIQO_IMAGE_QUALITY_STAGE=FIXTURE");
runNode(
  ["--env-file=.env.local", "scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs"],
  { AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_SCOPE: "CORE_IMAGE_CINEMA" },
);

const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
if (
  fixtures?.contract !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1" ||
  fixtures?.fixture_scope !== "CORE_IMAGE_CINEMA" ||
  fixtures?.source_scope !== "BENCHMARK_ONLY"
) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_FIXTURE_CONTRACT_INVALID");
}

const target = fixtures?.uploads?.["ai.image.generate"];
if (!text(target?.signed_url) || !text(target?.storage_reference)) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_OUTPUT_TARGET_INVALID");
}

console.log("AVANTIQO_IMAGE_QUALITY_STAGE=GENERATION");
runNode(
  ["--env-file=.env.local", "scripts/benchmark-avantiqo-image.mjs"],
  {
    RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID: imageEndpointId,
    AVANTIQO_IMAGE_BENCHMARK_RUNS: "1",
    AVANTIQO_IMAGE_BENCHMARK_FOUNDATION_MODEL: QUALITY_FOUNDATION_MODEL,
    AVANTIQO_IMAGE_BENCHMARK_INSTRUCTION:
      text(process.env.AVANTIQO_IMAGE_BENCHMARK_INSTRUCTION) || HUMAN_RESTAURANT_INSTRUCTION,
    AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL: target.signed_url,
    AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE: target.storage_reference,
  },
);

console.log("AVANTIQO_IMAGE_QUALITY_TEST_COMPLETE=YES");
