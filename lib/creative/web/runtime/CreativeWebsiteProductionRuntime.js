import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function safe(value) {
  return text(value).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function checksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildContract(task) {
  const input = task.input || {};
  const spec = input.website_specification || input.specification || {};
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  return {
    title: text(spec.title || input.title || "Avantiqo Website"),
    description: text(spec.description || input.description),
    sections,
    requirements: {
      responsive: spec.responsive !== false,
      forms: Array.isArray(spec.forms) ? spec.forms : [],
      analytics_required: spec.analytics_required === true,
    },
  };
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSection(section) {
  const heading = escapeHtml(section.heading || section.title);
  const body = escapeHtml(section.body || section.description);
  const mediaUrl = text(section.media?.url || section.image_url || section.imageUrl);
  const media = mediaUrl
    ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(section.media?.alt || heading || "Section image")}" loading="lazy" />`
    : "";
  return `<section><div class="section-copy">${heading ? `<h2>${heading}</h2>` : ""}${body ? `<p>${body}</p>` : ""}</div>${media}</section>`;
}

function buildFiles(contract) {
  const navLinks = contract.sections
    .map((section, index) => `<a href="#section-${index + 1}">${escapeHtml(section.heading || section.title || `Section ${index + 1}`)}</a>`)
    .join("");
  const sections = contract.sections
    .map((section, index) => `<div id="section-${index + 1}">${renderSection(section)}</div>`)
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(contract.description)}"><title>${escapeHtml(contract.title)}</title><link rel="stylesheet" href="styles.css"></head><body><nav aria-label="Primary navigation">${navLinks}</nav><main><header><h1>${escapeHtml(contract.title)}</h1>${contract.description ? `<p>${escapeHtml(contract.description)}</p>` : ""}</header>${sections}</main></body></html>`;
  const css = `:root{font-family:Inter,system-ui,sans-serif;color:#111827;background:#fff}*{box-sizing:border-box}body{margin:0}nav{display:flex;gap:1rem;padding:1rem 5vw;position:sticky;top:0;background:rgba(255,255,255,.95);border-bottom:1px solid #e5e7eb}nav a{color:inherit;text-decoration:none}main{width:min(1180px,90vw);margin:auto}header{padding:7rem 0 4rem}h1{font-size:clamp(2.75rem,8vw,6.5rem);line-height:.95;margin:0 0 1.5rem}header p{max-width:680px;font-size:1.25rem;line-height:1.6}section{display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center;padding:4rem 0;border-top:1px solid #e5e7eb}section img{width:100%;height:auto;border-radius:1rem}.section-copy p{font-size:1.1rem;line-height:1.7}@media(max-width:760px){nav{overflow:auto}header{padding-top:4rem}section{grid-template-columns:1fr;gap:1.5rem;padding:2.5rem 0}}`;
  return { "index.html": html, "styles.css": css };
}

function verifyWebsite(files, contract) {
  const failures = [];
  const html = files["index.html"];
  if (!/<!doctype html>/i.test(html)) failures.push("WEBSITE_DOCTYPE_REQUIRED");
  if (!/<meta name="viewport"/i.test(html)) failures.push("WEBSITE_VIEWPORT_REQUIRED");
  if (!/<main[\s>]/i.test(html)) failures.push("WEBSITE_MAIN_LANDMARK_REQUIRED");
  if (!/<nav[^>]+aria-label=/i.test(html)) failures.push("WEBSITE_NAVIGATION_LABEL_REQUIRED");
  if (!/<h1[\s>]/i.test(html)) failures.push("WEBSITE_PRIMARY_HEADING_REQUIRED");
  if (contract.requirements.responsive && !/@media\s*\(/i.test(files["styles.css"])) failures.push("WEBSITE_RESPONSIVE_CSS_REQUIRED");
  if (/target="_blank"/i.test(html) && !/rel="[^"]*noopener/i.test(html)) failures.push("WEBSITE_EXTERNAL_LINK_SECURITY_REQUIRED");
  if (contract.sections.some((section) => text(section.media?.url) && !text(section.media?.url).startsWith("data:image/"))) {
    failures.push("WEBSITE_REMOTE_MEDIA_NOT_PACKAGED");
  }
  if (contract.requirements.forms.length) failures.push("WEBSITE_FORM_RUNTIME_REQUIRED");
  if (contract.requirements.analytics_required) failures.push("WEBSITE_ANALYTICS_RUNTIME_REQUIRED");
  return { passed: failures.length === 0, failures };
}

function runBrowser(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("WEBSITE_BROWSER_TIMEOUT"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `WEBSITE_BROWSER_EXIT_${code}`));
    });
  });
}

async function browserEvidence(directory, policy = {}) {
  const executable = policy.browser_path || policy.browserPath || process.env.CREATIVE_BROWSER_EXECUTABLE_PATH || null;
  if (!executable) throw new Error("CREATIVE_BROWSER_EXECUTABLE_PATH_REQUIRED");
  const screenshotPath = path.join(directory, "browser-desktop.png");
  const width = Number(policy.viewport_width || 1440);
  const height = Number(policy.viewport_height || 1000);
  await runBrowser(executable, ["--headless", "--disable-gpu", "--no-sandbox", `--window-size=${width},${height}`, `--screenshot=${screenshotPath}`, `file://${path.join(directory, "index.html")}`], Number(policy.timeout_ms || 30000));
  const buffer = await fs.readFile(screenshotPath);
  if (!buffer.length) throw new Error("WEBSITE_BROWSER_SCREENSHOT_EMPTY");
  return { path: screenshotPath, buffer, width, height, checksum: checksum(buffer) };
}

async function upload(task, name, buffer, contentType, identity) {
  const bucket = task.input?.storage_policy?.bucket || task.metadata?.storage_policy?.bucket || process.env.CREATIVE_WEBSITE_BUILD_BUCKET || process.env.CREATIVE_MEDIA_RENDER_BUCKET || null;
  if (!bucket) throw new Error("CREATIVE_WEBSITE_STORAGE_BUCKET_REQUIRED");
  const storagePath = [safe(task.organization_id), safe(task.creative_project_id), "websites", safe(task.metadata?.deliverable_id || task.id), identity, name].join("/");
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, { contentType, upsert: false });
  if (error) throw error;
  return { bucket, storage_path: storagePath };
}

async function signedUrl(bucket, storagePath) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function executeCreativeWebsiteProductionTask(task) {
  const contract = buildContract(task);
  const files = buildFiles(contract);
  const verification = verifyWebsite(files, contract);
  if (!verification.passed) {
    const error = new Error("CREATIVE_WEBSITE_CONTRACT_INCOMPLETE");
    error.details = verification.failures;
    throw error;
  }

  const identity = checksum(JSON.stringify({ contract, files })).slice(0, 24);
  const uploaded = {};
  for (const [name, value] of Object.entries(files)) {
    uploaded[name] = await upload(task, name, Buffer.from(value, "utf8"), name.endsWith(".css") ? "text/css" : "text/html", identity);
  }

  const output = {
    identity,
    contract,
    files: Object.fromEntries(
      await Promise.all(
        Object.entries(uploaded).map(async ([name, record]) => [
          name,
          {
            ...record,
            signed_url: await signedUrl(record.bucket, record.storage_path),
          },
        ]),
      ),
    ),
    verification,
  };

  const browserPolicy = task.input?.browser_policy || task.metadata?.browser_policy || null;
  if (browserPolicy?.required) {
    const directory = await fs.mkdtemp(path.join(process.env.TMPDIR || "/tmp", "avantiqo-web-"));
    try {
      await Promise.all(
        Object.entries(files).map(([name, value]) => fs.writeFile(path.join(directory, name), value, "utf8")),
      );
      const evidence = await browserEvidence(directory, browserPolicy);
      const uploadedEvidence = await upload(task, "browser-desktop.png", evidence.buffer, "image/png", identity);
      output.browser_evidence = {
        ...uploadedEvidence,
        signed_url: await signedUrl(uploadedEvidence.bucket, uploadedEvidence.storage_path),
        width: evidence.width,
        height: evidence.height,
        checksum: evidence.checksum,
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  return output;
}
