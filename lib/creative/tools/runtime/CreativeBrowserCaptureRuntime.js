import crypto from "node:crypto";

import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_BROWSER_CAPTURE_RUNTIME_V1";
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

function scriptSource(config) {
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
      content: scriptSource({
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

export const CreativeBrowserCaptureRuntime = Object.freeze({
  contract: CONTRACT,
  captureFrame: captureCreativeBrowserFrame,
});
