#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const ORGANIZATION_ID =
  process.env.COLE_PREFLIGHT_ORGANIZATION_ID ||
  "9550b843-b83c-4d15-b02d-a0b5ca23346e";
const PROJECT_ID = "3866623f-d9a6-45d3-99b8-e978666cc028";
const SHORTLIST_IDENTITY =
  "8c3d2deed60db0f8599ce049d787e83203d18694627fdb1b53351a32d7c49446";
const MAXIMUM_AI_CALLS = 28;
const MAXIMUM_CUSTOMER_PRICE = 12.2304;
const CURRENCY = "THB";
const REQUIRED_SOURCE_PORT = 43871;
const BASE_URL = process.env.COLE_PREFLIGHT_BASE_URL || "http://127.0.0.1:3011";
const SOURCE_PORT = Number(process.env.COLE_PREFLIGHT_SOURCE_PORT || REQUIRED_SOURCE_PORT);
const DOWNLOADS = path.join(process.env.HOME || "", "Downloads");
const STATE_PATH =
  process.env.COLE_PREFLIGHT_STATE ||
  path.join(DOWNLOADS, "COLE_LEY_PERSISTED_PREFLIGHT_STATE_V2.json");
const REPORT_PATH =
  process.env.COLE_VERIFICATION_REPORT ||
  path.join(
    DOWNLOADS,
    `COLE_LEY_PAID_VERIFICATION_${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")}.json`,
  );

const SOURCES = [
  "IMG_0013.MOV",
  "IMG_0021.MOV",
  "IMG_0023.MOV",
  "IMG_0973.MOV",
  "IMG_0974.MOV",
  "IMG_0975.MOV",
  "IMG_2622.MOV",
  "IMG_2628.MOV",
].map((name) => ({
  name,
  file: path.join(DOWNLOADS, name),
  mime: "video/quicktime",
}));

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sameMoney(left, right) {
  return Math.abs(finite(left) - finite(right)) <= 0.000001;
}

function authHeaders() {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const bearer = text(process.env.CREATIVE_SMOKE_BEARER_TOKEN);
  const cookie = text(process.env.CREATIVE_SMOKE_COOKIE);
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  if (!bearer && !cookie) {
    throw new Error(
      "CREATIVE_SMOKE_BEARER_TOKEN or CREATIVE_SMOKE_COOKIE required",
    );
  }
  return headers;
}

async function post(route, body) {
  const response = await fetch(new URL(route, BASE_URL), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      organization_id: ORGANIZATION_ID,
      ...body,
    }),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok || payload.success === false) {
    const error = new Error(
      `${body.action} failed (${response.status}): ` +
      `${payload.error || payload.message || raw || response.statusText}`,
    );
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function assertAppReady() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Continue until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Avantiqo server not ready at ${BASE_URL}`);
}

function contentType(name) {
  return name.toLowerCase().endsWith(".mov")
    ? "video/quicktime"
    : "application/octet-stream";
}

function createSourceServer() {
  const allowed = new Map(SOURCES.map((source) => [source.name, source.file]));
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(
        request.url || "/",
        `http://127.0.0.1:${SOURCE_PORT}`,
      );
      const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const filePath = allowed.get(name);
      if (!filePath) {
        response.writeHead(404).end("Not found");
        return;
      }

      const stat = await fsp.stat(filePath);
      const range = request.headers.range;
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Content-Type", contentType(name));
      response.setHeader("Cache-Control", "no-store");

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          response.writeHead(416).end();
          return;
        }
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2]
          ? Math.min(Number(match[2]), stat.size - 1)
          : stat.size - 1;
        if (start > end || start >= stat.size) {
          response.writeHead(416, {
            "Content-Range": `bytes */${stat.size}`,
          }).end();
          return;
        }
        response.writeHead(206, {
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        });
        fs.createReadStream(filePath, { start, end }).pipe(response);
        return;
      }

      response.writeHead(200, { "Content-Length": stat.size });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error?.message || String(error));
    }
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(SOURCE_PORT, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

async function close(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

async function validateLocalState() {
  const state = JSON.parse(await fsp.readFile(STATE_PATH, "utf8"));
  if (text(state.organization_id) !== ORGANIZATION_ID) {
    throw new Error("COLE_VERIFICATION_ORGANIZATION_MISMATCH");
  }
  if (text(state.creative_project_id) !== PROJECT_ID) {
    throw new Error("COLE_VERIFICATION_PROJECT_MISMATCH");
  }
  if (text(state.project_shortlist_identity) !== SHORTLIST_IDENTITY) {
    throw new Error("COLE_VERIFICATION_SHORTLIST_IDENTITY_MISMATCH");
  }

  for (const source of SOURCES) {
    await fsp.access(source.file, fs.constants.R_OK);
    const sourceState = state.sources?.[source.name];
    if (!sourceState?.asset_node_id) {
      throw new Error(`COLE_VERIFICATION_SOURCE_NODE_MISSING:${source.name}`);
    }
    if (sourceState.local_shortlist_status !== "COMPLETE") {
      throw new Error(`COLE_VERIFICATION_SOURCE_NOT_COMPLETE:${source.name}`);
    }
  }

  return state;
}

function validateLivePlan(status) {
  const price = finite(status.cost_estimate?.estimated_customer_price, -1);
  const calls = finite(status.estimated_ai_calls, -1);
  const currency = text(status.cost_estimate?.currency).toUpperCase();

  if (status.production_started !== false) {
    throw new Error("COLE_VERIFICATION_PRODUCTION_LOCK_FAILED");
  }
  if (text(status.creative_project_id) !== PROJECT_ID) {
    throw new Error("COLE_VERIFICATION_LIVE_PROJECT_MISMATCH");
  }
  if (text(status.project_shortlist_identity) !== SHORTLIST_IDENTITY) {
    throw new Error("COLE_VERIFICATION_LIVE_IDENTITY_MISMATCH");
  }
  if (status.cost_estimate?.ready !== true) {
    throw new Error("COLE_VERIFICATION_COST_ESTIMATE_NOT_READY");
  }
  if (calls !== MAXIMUM_AI_CALLS) {
    throw new Error(`COLE_VERIFICATION_CALL_LIMIT_MISMATCH:${calls}`);
  }
  if (!sameMoney(price, MAXIMUM_CUSTOMER_PRICE)) {
    throw new Error(`COLE_VERIFICATION_PRICE_LIMIT_MISMATCH:${price}`);
  }
  if (currency !== CURRENCY) {
    throw new Error(`COLE_VERIFICATION_CURRENCY_MISMATCH:${currency}`);
  }
  if (finite(status.selected_candidate_count, -1) !== 14) {
    throw new Error(
      `COLE_VERIFICATION_SELECTED_COUNT_MISMATCH:${status.selected_candidate_count}`,
    );
  }

  return { price, calls, currency };
}

async function main() {
  if (SOURCE_PORT !== REQUIRED_SOURCE_PORT) {
    throw new Error(
      `COLE_VERIFICATION_SOURCE_PORT_MUST_BE_${REQUIRED_SOURCE_PORT}:${SOURCE_PORT}`,
    );
  }

  await assertAppReady();
  const state = await validateLocalState();
  const maximumSourceBytes = Math.max(
    ...SOURCES.map((source) =>
      finite(state.sources?.[source.name]?.technical?.file_size_bytes, 0)),
  );
  if (maximumSourceBytes <= 0) {
    throw new Error("COLE_VERIFICATION_SOURCE_SIZE_MISSING");
  }

  const sourceServer = createSourceServer();
  await listen(sourceServer);
  console.log(`LOCAL_SOURCE_SERVER=http://127.0.0.1:${SOURCE_PORT}`);

  try {
    const before = await post("/api/creative/media/shortlist", {
      action: "STATUS",
      creative_project_id: PROJECT_ID,
    });
    const plan = validateLivePlan(before);

    console.log("============================================================");
    console.log("COLE LEY BOUNDED AI VERIFICATION GATE");
    console.log("============================================================");
    console.log(`PROJECT_ID=${PROJECT_ID}`);
    console.log(`PROJECT_SHORTLIST_IDENTITY=${SHORTLIST_IDENTITY}`);
    console.log(`MAXIMUM_AI_CALLS=${plan.calls}`);
    console.log(`MAXIMUM_CUSTOMER_PRICE=${plan.price}`);
    console.log(`CURRENCY=${plan.currency}`);
    console.log("PRODUCTION_AUTHORIZED=NO");
    console.log("PRODUCTION_STARTED=NO");
    console.log("PAID_ANALYSIS_GATE=ACCEPTED");
    console.log("============================================================");

    const verification = await post("/api/creative/media/shortlist", {
      action: "VERIFY",
      creative_project_id: PROJECT_ID,
      currency: CURRENCY,
      authorization: {
        approved: true,
        project_shortlist_identity: SHORTLIST_IDENTITY,
        maximum_ai_calls: MAXIMUM_AI_CALLS,
        maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
        currency: CURRENCY,
      },
      policy: {
        requested_subject: "the primary lead vocalist and central live performer",
        allow_private_networks: true,
        allowed_hosts: ["127.0.0.1", "localhost"],
        max_bytes: maximumSourceBytes + 1024 * 1024,
        minimum_quality_score: 55,
        minimum_primary_performer_ratio: 0.5,
        minimum_vocalist_ratio: 0.5,
        output_width: 1920,
        output_height: 1080,
        frame_rate: 30,
        video_codec: "libx264",
        video_preset: "medium",
        video_crf: 18,
        audio_codec: "aac",
        audio_bitrate: "192k",
      },
    });

    if (verification.production_started !== false) {
      throw new Error("COLE_VERIFICATION_UNEXPECTED_PRODUCTION_START");
    }
    if (finite(verification.completed_ai_calls, 0) > MAXIMUM_AI_CALLS) {
      throw new Error("COLE_VERIFICATION_CALL_LIMIT_EXCEEDED");
    }

    const after = await post("/api/creative/media/shortlist", {
      action: "STATUS",
      creative_project_id: PROJECT_ID,
    });
    if (after.production_started !== false) {
      throw new Error("COLE_VERIFICATION_POST_STATUS_PRODUCTION_LOCK_FAILED");
    }
    if (after.paid_analysis_authorized !== true) {
      throw new Error("COLE_VERIFICATION_COMPLETION_NOT_PERSISTED");
    }

    const report = {
      generated_at: new Date().toISOString(),
      mode: "BOUNDED_PAID_AI_VERIFICATION",
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      project_shortlist_identity: SHORTLIST_IDENTITY,
      authorization: {
        approved: true,
        maximum_ai_calls: MAXIMUM_AI_CALLS,
        maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
        currency: CURRENCY,
        production_authorized: false,
      },
      before,
      verification,
      after,
      production_started: false,
    };
    await fsp.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("");
    console.log("============================================================");
    console.log("COLE LEY PAID AI VERIFICATION RESULT");
    console.log("============================================================");
    console.log(`COMPLETED_AI_CALLS=${finite(verification.completed_ai_calls, 0)}`);
    console.log(`CONFIGURED_CALL_LIMIT=${MAXIMUM_AI_CALLS}`);
    console.log(`CONFIGURED_PRICE_LIMIT=${MAXIMUM_CUSTOMER_PRICE}`);
    console.log(`CURRENCY=${CURRENCY}`);
    console.log(`VERIFIED_MOMENT_COUNT=${finite(after.verified_moment_count, 0)}`);
    console.log(
      `VERIFIED_DURATION_SECONDS=${finite(after.verified_duration_seconds, 0)}`,
    );
    console.log("PAID_ANALYSIS_AUTHORIZED=YES");
    console.log("PRODUCTION_AUTHORIZED=NO");
    console.log("PRODUCTION_STARTED=NO");
    console.log(`REPORT=${REPORT_PATH}`);
    console.log("============================================================");
  } finally {
    await close(sourceServer);
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  if (error?.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  console.error("PRODUCTION_STARTED=NO");
  process.exit(1);
});
