import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { createStoredZip } from "@/lib/creative/documents/runtime/OpenXmlPackageRuntime";
import * as ProductionTaskRepository from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import {
  resolveWebsiteContract,
  unwrapWebsiteOutput,
  websiteQualityFailures,
  websiteQualityPass,
} from "./WebsiteContractRuntime";

const supabaseAdmin = getServiceSupabase();

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safe(value, fallback = "website") {
  return text(value || fallback).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}
function checksum(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

async function projectTasks(task) {
  return ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

function dependencyTasks(task, tasks) {
  const ids = new Set(list(task.depends_on));
  return tasks.filter((candidate) => ids.has(candidate.id));
}

function embeddedMedia(section) {
  const url = text(section.media?.url);
  if (!url || !url.startsWith("data:image/")) return "";
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(section.media.alt || section.title || "")}" loading="lazy">`;
}

function sectionHtml(section, index) {
  const items = list(section.items).map((item) => {
    const value = typeof item === "string" ? { title: item } : object(item);
    return `<article class="card"><h3>${escapeHtml(value.title || value.heading || "")}</h3>` +
      `<p>${escapeHtml(value.body || value.copy || value.description || "")}</p></article>`;
  }).join("");
  const cta = section.cta?.href && section.cta?.label
    ? `<a class="button" href="${escapeHtml(section.cta.href)}">${escapeHtml(section.cta.label)}</a>` : "";
  const heading = index === 0 ? "h1" : "h2";
  return `<section id="${escapeHtml(section.id)}" class="section section-${escapeHtml(section.type)}">` +
    `<div class="section-copy">${section.eyebrow ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : ""}` +
    `<${heading}>${escapeHtml(section.title)}</${heading}><p>${escapeHtml(section.body)}</p>${cta}</div>${embeddedMedia(section)}` +
    `${items ? `<div class="grid">${items}</div>` : ""}</section>`;
}

function websiteFiles(contract) {
  const nav = list(contract.navigation).map((item) => {
    const value = typeof item === "string" ? { label: item, href: `#${safe(item)}` } : object(item);
    return `<a href="${escapeHtml(value.href || "#")}">${escapeHtml(value.label || value.title || "Link")}</a>`;
  }).join("");
  const html = `<!doctype html><html lang="${escapeHtml(contract.language)}"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(contract.title)}</title><meta name="description" content="${escapeHtml(contract.description)}">` +
    `<link rel="stylesheet" href="styles.css"></head><body><a class="skip" href="#main">Skip to content</a>` +
    `<header><a class="brand" href="#">${escapeHtml(contract.title)}</a><nav aria-label="Primary navigation">${nav}</nav>` +
    `<button class="nav-toggle" type="button" aria-expanded="false" aria-label="Toggle navigation">Menu</button></header>` +
    `<main id="main">${contract.sections.map(sectionHtml).join("")}</main>` +
    `<footer><p>${escapeHtml(contract.title)}</p></footer><script src="app.js" defer></script></body></html>`;
  const theme = contract.theme;
  const css = `:root{--bg:${theme.background};--surface:${theme.surface};--fg:${theme.foreground};--muted:${theme.muted};--accent:${theme.accent};font-family:${theme.font_family};}` +
    `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);line-height:1.6}` +
    `a{color:inherit}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:var(--fg);color:var(--bg);padding:.7rem;z-index:10}` +
    `header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:1rem clamp(1rem,5vw,5rem);background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid color-mix(in srgb,var(--fg) 12%,transparent)}` +
    `.brand{text-decoration:none;font-weight:700}nav{display:flex;gap:1.2rem}nav a{text-decoration:none;color:var(--muted)}nav a:hover,nav a:focus{color:var(--accent)}` +
    `.nav-toggle{display:none;background:transparent;color:var(--fg);border:1px solid var(--muted);padding:.55rem .8rem}` +
    `main{overflow:hidden}.section{min-height:65vh;padding:clamp(4rem,9vw,9rem) clamp(1rem,8vw,8rem);display:grid;gap:2rem;align-items:center}` +
    `.section:nth-child(even){background:var(--surface)}.section-copy{max-width:760px}.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.18em;font-size:.78rem}` +
    `h1,h2,h3{line-height:1.08;margin:0 0 1rem}h1,h2{font-size:clamp(2.2rem,7vw,6rem);letter-spacing:-.045em}p{color:var(--muted);max-width:68ch}` +
    `.button{display:inline-block;margin-top:1rem;padding:.85rem 1.2rem;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:700}` +
    `.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.card{padding:1.4rem;background:color-mix(in srgb,var(--surface) 82%,var(--fg) 4%);border:1px solid color-mix(in srgb,var(--fg) 12%,transparent)}` +
    `img{display:block;width:100%;height:auto;max-height:70vh;object-fit:cover}footer{padding:2rem clamp(1rem,8vw,8rem);border-top:1px solid color-mix(in srgb,var(--fg) 12%,transparent)}` +
    `:focus-visible{outline:3px solid var(--accent);outline-offset:4px}@media(max-width:760px){nav{display:none;position:absolute;top:100%;left:0;right:0;flex-direction:column;padding:1rem;background:var(--bg)}nav.open{display:flex}.nav-toggle{display:block}.section{min-height:auto}}` +
    `@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
  const js = `const button=document.querySelector('.nav-toggle');const nav=document.querySelector('nav');if(button&&nav){button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));nav.classList.toggle('open',!open);});}`;
  const componentManifest = JSON.stringify({
    contract: "AVANTIQO_COMPONENT_MANIFEST_V1",
    sections: contract.sections.map((section, index) => ({ id: section.id, type: section.type, heading_level: index === 0 ? 1 : 2, item_count: list(section.items).length })),
    interactions: [{ id: "mobile-navigation", trigger: ".nav-toggle", target: "nav", accessibility_state: "aria-expanded" }],
  }, null, 2);
  const manifest = JSON.stringify({
    contract: "AVANTIQO_STATIC_WEBSITE_V1",
    title: contract.title,
    files: ["index.html", "styles.css", "app.js", "component-manifest.json"],
  }, null, 2);
  return {
    "index.html": html,
    "styles.css": css,
    "app.js": js,
    "component-manifest.json": componentManifest,
    "site-manifest.json": manifest,
  };
}

function staticAudit(files, contract) {
  const html = files["index.html"];
  const failures = [];
  if (!/^<!doctype html>/i.test(html)) failures.push("WEBSITE_DOCTYPE_REQUIRED");
  if (!/<html[^>]+lang=/i.test(html)) failures.push("WEBSITE_LANGUAGE_REQUIRED");
  if (!/<meta[^>]+name="viewport"/i.test(html)) failures.push("WEBSITE_VIEWPORT_REQUIRED");
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
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("WEBSITE_BROWSER_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(Buffer.concat(stderr).toString("utf8") || `WEBSITE_BROWSER_EXIT_${code}`)); });
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
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return { name, bucket, storage_path: storagePath, url: creativeStorageUri(bucket, storagePath), mime_type: contentType, file_size_bytes: buffer.length, checksum: checksum(buffer) };
}

export const CreativeWebsiteProductionRuntime = {
  async build(task) {
    if (!task?.organization_id || !task?.creative_project_id) throw new Error("CREATIVE_WEBSITE_CONTEXT_REQUIRED");
    const tasks = await projectTasks(task);
    const dependencies = dependencyTasks(task, tasks);
    const contract = resolveWebsiteContract(task, dependencies);
    const files = websiteFiles(contract);
    const audit = staticAudit(files, contract);
    if (!audit.passed) throw new Error(`CREATIVE_WEBSITE_STATIC_AUDIT_FAILED:${audit.failures.join(",")}`);
    const identity = crypto.createHash("sha256").update(JSON.stringify({ project_id: task.creative_project_id, deliverable_id: task.metadata?.deliverable_id, contract, files })).digest("hex");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-website-"));
    try {
      for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(directory, name), content);
      const browser = await browserEvidence(directory, task.input?.browser_policy || task.metadata?.browser_policy || {});
      const packageBuffer = createStoredZip(
        Object.entries(files).map(([name, data]) => ({ name, data })),
        { created_at: new Date("1980-01-01T00:00:00.000Z") },
      );
      const uploadedFiles = [];
      for (const [name, content] of Object.entries(files)) {
        const type = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "application/json";
        uploadedFiles.push(await upload(task, name, Buffer.from(content), type, identity));
      }
      const screenshot = await upload(task, "browser-desktop.png", browser.buffer, "image/png", identity);
      const bundle = await upload(task, "website.zip", packageBuffer, "application/zip", identity);
      return {
        type: "ASSET", name: `${contract.title} website`, url: bundle.url, file_url: bundle.url,
        storage_path: bundle.storage_path, mime_type: bundle.mime_type, package_url: bundle.url,
        package_id: identity, build_id: identity, checksum: bundle.checksum, files: [...uploadedFiles, screenshot, bundle],
        preview_url: uploadedFiles.find((file) => file.name === "index.html")?.url || null,
        screenshot_url: screenshot.url, browser_evidence: { width: browser.width, height: browser.height, checksum: browser.checksum },
        static_audit: audit, contract_summary: { title: contract.title, section_count: contract.sections.length, language: contract.language },
      };
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  },

  async validate(task) {
    const tasks = await projectTasks(task);
    const dependencies = dependencyTasks(task, tasks);
    const build = dependencies.find((item) => unwrapWebsiteOutput(item.output)?.package_url) || null;
    const review = dependencies.find((item) => item !== build) || null;
    const output = object(unwrapWebsiteOutput(build?.output));
    const failures = [];
    if (!build || build.status !== "COMPLETED") failures.push("WEBSITE_BUILD_NOT_COMPLETED");
    if (!output.package_url || !output.storage_path || !output.package_id) failures.push("WEBSITE_PACKAGE_EVIDENCE_REQUIRED");
    if (!output.preview_url) failures.push("WEBSITE_PREVIEW_FILE_REQUIRED");
    if (!output.screenshot_url || !output.browser_evidence?.checksum) failures.push("WEBSITE_BROWSER_EVIDENCE_REQUIRED");
    if (!output.static_audit?.passed) failures.push(...list(output.static_audit?.failures));
    const files = list(output.files);
    for (const required of ["index.html", "styles.css", "app.js", "component-manifest.json", "site-manifest.json", "website.zip"]) {
      const file = files.find((item) => item.name === required);
      if (!file?.url || !file?.storage_path || !file?.checksum || Number(file?.file_size_bytes || 0) <= 0) failures.push(`WEBSITE_FILE_INVALID:${required}`);
    }
    if (!review || !websiteQualityPass(review.output)) {
      failures.push(...websiteQualityFailures(review?.output));
      if (!websiteQualityFailures(review?.output).length) failures.push("WEBSITE_SEMANTIC_QUALITY_REJECTED");
    }
    return {
      passed: failures.length === 0, verdict: failures.length === 0 ? "PASSED" : "FAILED", overall_score: failures.length === 0 ? 1 : 0,
      failed_checks: [...new Set(failures)], repair_instructions: [...new Set(failures)].map((failure) => `Repair ${failure} and rebuild the website package.`),
      artifact: { package_url: output.package_url || null, preview_url: output.preview_url || null, screenshot_url: output.screenshot_url || null, package_id: output.package_id || null, files },
      deployment: { ready: failures.length === 0, published: false, target: task.metadata?.output_spec?.deployment_target || null },
    };
  },
};
