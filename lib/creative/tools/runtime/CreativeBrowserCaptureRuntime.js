import crypto from "node:crypto";

import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_BROWSER_CAPTURE_RUNTIME_V2";
const TOOL_ID = "chromium-playwright";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function snapshotId(project) {
  return text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
}

function assertCaptureUrl(value, allowedHosts = []) {
  const url = new URL(text(value));
  if (url.protocol !== "https:") {
    throw new Error("CREATIVE_BROWSER_CAPTURE_HTTPS_REQUIRED");
  }

  const hosts = allowedHosts.map((host) => text(host).toLowerCase()).filter(Boolean);
  if (hosts.length && !hosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`CREATIVE_BROWSER_CAPTURE_HOST_NOT_ALLOWED:${url.hostname}`);
  }

  return url.toString();
}

function jobId(input) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 20);
}

function captureScriptSource(config) {
  return `
const { chromium } = require('/tmp/avantiqo-browser/node_modules/playwright');

(async () => {
  const config = ${JSON.stringify(config)};
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.deviceScaleFactor,
    colorScheme: config.colorScheme,
  });
  const page = await context.newPage();
  await page.goto(config.url, {
    waitUntil: config.waitUntil,
    timeout: config.navigationTimeoutMs,
  });
  if (config.settleMs > 0) await page.waitForTimeout(config.settleMs);

  for (const selector of config.hideSelectors) {
    await page.locator(selector).evaluateAll((nodes) => {
      for (const node of nodes) node.style.visibility = 'hidden';
    }).catch(() => null);
  }

  await page.screenshot({
    path: config.outputPath,
    fullPage: config.fullPage,
    animations: 'disabled',
    caret: 'hide',
  });

  const title = await page.title();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  console.log(JSON.stringify({ title, dimensions, url: page.url() }));
  await browser.close();
})();
`;
}

function recordScriptSource(config) {
  return `
const fs = require('fs');
const path = require('path');
const { chromium } = require('/tmp/avantiqo-browser/node_modules/playwright');

(async () => {
  const config = ${JSON.stringify(config)};
  fs.mkdirSync(config.videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.deviceScaleFactor,
    colorScheme: config.colorScheme,
    recordVideo: {
      dir: config.videoDir,
      size: { width: config.width, height: config.height },
    },
  });
  const page = await context.newPage();
  await page.goto(config.url, {
    waitUntil: config.waitUntil,
    timeout: config.navigationTimeoutMs,
  });
  if (config.settleMs > 0) await page.waitForTimeout(config.settleMs);

  for (const selector of config.hideSelectors) {
    await page.locator(selector).evaluateAll((nodes) => {
      for (const node of nodes) node.style.visibility = 'hidden';
    }).catch(() => null);
  }

  const startedAt = Date.now();
  const durationMs = config.durationMs;
  const scrollDistance = config.scrollDistance;
  const scrollSteps = Math.max(1, config.scrollSteps);

  if (scrollDistance !== 0) {
    for (let step = 1; step <= scrollSteps; step += 1) {
      const y = Math.round(scrollDistance * (step / scrollSteps));
      await page.evaluate((value) => window.scrollTo({ top: value, behavior: 'smooth' }), y);
      await page.waitForTimeout(Math.max(40, Math.floor(durationMs / scrollSteps)));
    }
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < durationMs) await page.waitForTimeout(durationMs - elapsed);

  const video = page.video();
  const title = await page.title();
  const finalUrl = page.url();
  await context.close();
  const videoPath = await video.path();
  fs.copyFileSync(videoPath, config.outputPath);
  await browser.close();

  console.log(JSON.stringify({
    title,
    url: finalUrl,
    duration_ms: durationMs,
    output_path: config.outputPath,
  }));
})();
`;
}

export async function captureCreativeBrowserFrame({
  project,
  url,
  allowed_hosts = [],
  width = 1920,
  height = 1080,
  device_scale_factor = 1,
  full_page = false,
  settle_ms = 1250,
  navigation_timeout_ms = 45000,
  wait_until = "networkidle",
  color_scheme = "dark",
  hide_selectors = [],
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) {
    throw new Error("CREATIVE_BROWSER_CAPTURE_SNAPSHOT_REQUIRED");
  }

  const captureUrl = assertCaptureUrl(url, allowed_hosts);
  const identity = jobId({
    captureUrl,
    width,
    height,
    device_scale_factor,
    full_page,
    hide_selectors,
  });
  const base = `/tmp/avantiqo-browser-job-${identity}`;
  const scriptPath = `${base}/capture.cjs`;
  const outputPath = `${base}/capture.png`;

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 180000,
    network_policy: "allow-all",
  });

  try {
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: scriptPath,
      content: captureScriptSource({
        url: captureUrl,
        width: positiveInteger(width, 1920),
        height: positiveInteger(height, 1080),
        deviceScaleFactor: Math.max(1, Number(device_scale_factor) || 1),
        fullPage: full_page === true,
        settleMs: Math.max(0, Number(settle_ms) || 0),
        navigationTimeoutMs: positiveInteger(navigation_timeout_ms, 45000),
        waitUntil: ["load", "domcontentloaded", "networkidle", "commit"].includes(wait_until)
          ? wait_until
          : "networkidle",
        colorScheme: color_scheme === "light" ? "light" : "dark",
        hideSelectors: Array.isArray(hide_selectors)
          ? hide_selectors.map(text).filter(Boolean).slice(0, 30)
          : [],
        outputPath,
      }),
    });

    const execution = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "node",
      args: [scriptPath],
      error_prefix: "CREATIVE_BROWSER_CAPTURE_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({ sandbox, path: outputPath });

    let metadata = null;
    try {
      metadata = JSON.parse(execution.stdout || "null");
    } catch {
      metadata = null;
    }

    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      mime_type: "image/png",
      buffer,
      bytes: buffer.length,
      source_url: captureUrl,
      metadata,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export async function recordCreativeBrowser({
  project,
  url,
  allowed_hosts = [],
  width = 1920,
  height = 1080,
  device_scale_factor = 1,
  duration_ms = 8000,
  settle_ms = 1250,
  navigation_timeout_ms = 45000,
  wait_until = "networkidle",
  color_scheme = "dark",
  hide_selectors = [],
  scroll_distance = 0,
  scroll_steps = 1,
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) {
    throw new Error("CREATIVE_BROWSER_CAPTURE_SNAPSHOT_REQUIRED");
  }

  const captureUrl = assertCaptureUrl(url, allowed_hosts);
  const durationMs = Math.min(60000, Math.max(1000, Number(duration_ms) || 8000));
  const identity = jobId({
    captureUrl,
    width,
    height,
    durationMs,
    scroll_distance,
    scroll_steps,
    hide_selectors,
  });
  const base = `/tmp/avantiqo-browser-record-${identity}`;
  const scriptPath = `${base}/record.cjs`;
  const outputPath = `${base}/recording.webm`;
  const videoDir = `${base}/video`;

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: Math.max(180000, durationMs + 90000),
    network_policy: "allow-all",
  });

  try {
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: scriptPath,
      content: recordScriptSource({
        url: captureUrl,
        width: positiveInteger(width, 1920),
        height: positiveInteger(height, 1080),
        deviceScaleFactor: Math.max(1, Number(device_scale_factor) || 1),
        durationMs,
        settleMs: Math.max(0, Number(settle_ms) || 0),
        navigationTimeoutMs: positiveInteger(navigation_timeout_ms, 45000),
        waitUntil: ["load", "domcontentloaded", "networkidle", "commit"].includes(wait_until)
          ? wait_until
          : "networkidle",
        colorScheme: color_scheme === "light" ? "light" : "dark",
        hideSelectors: Array.isArray(hide_selectors)
          ? hide_selectors.map(text).filter(Boolean).slice(0, 30)
          : [],
        scrollDistance: Number(scroll_distance) || 0,
        scrollSteps: Math.min(60, Math.max(1, positiveInteger(scroll_steps, 1))),
        outputPath,
        videoDir,
      }),
    });

    const execution = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "node",
      args: [scriptPath],
      error_prefix: "CREATIVE_BROWSER_RECORD_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({
      sandbox,
      path: outputPath,
    });

    let metadata = null;
    try {
      metadata = JSON.parse(execution.stdout || "null");
    } catch {
      metadata = null;
    }

    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      mime_type: "video/webm",
      buffer,
      bytes: buffer.length,
      source_url: captureUrl,
      metadata,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeBrowserCaptureRuntime = Object.freeze({
  contract: CONTRACT,
  captureFrame: captureCreativeBrowserFrame,
  record: recordCreativeBrowser,
});
