import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_AI_LOCAL_COMPUTER_LANDING_PAGE_VERIFIER_V1";
const APP_ROOT = "local-audit-output/avantiqo-code-ai-landing-page";
const BUILD_OUTPUT = path.join(os.tmpdir(), "avantiqo-code-ai-landing-page-proof.html");

function requiredText(value, label) {
  const text = String(value ?? "");
  assert.ok(text.trim(), `${label}_REQUIRED`);
  return text;
}

function countMatches(source, expression) {
  return (source.match(expression) || []).length;
}

const [html, css, buildSource] = await Promise.all([
  readFile(path.join(APP_ROOT, "index.html"), "utf8"),
  readFile(path.join(APP_ROOT, "styles.css"), "utf8"),
  readFile(path.join(APP_ROOT, "build.mjs"), "utf8"),
]);

requiredText(html, "HTML");
requiredText(css, "CSS");
requiredText(buildSource, "BUILD_SOURCE");

assert.match(html, /<!doctype html>/i, "HTML_DOCTYPE_REQUIRED");
assert.match(html, /<meta[^>]+name=["']viewport["']/i, "RESPONSIVE_VIEWPORT_REQUIRED");
assert.match(html, /<title>[^<]{4,}<\/title>/i, "MEANINGFUL_TITLE_REQUIRED");
assert.match(html, /<main[\s>]/i, "SEMANTIC_MAIN_REQUIRED");
assert.match(html, /<h1[\s>][\s\S]*?<\/h1>/i, "HERO_H1_REQUIRED");
assert.ok(countMatches(html, /<section[\s>]/gi) >= 3, "THREE_CONTENT_SECTIONS_REQUIRED");
assert.ok(
  countMatches(html, /<(a|button)[\s>]/gi) >= 2,
  "MULTIPLE_CALLS_TO_ACTION_REQUIRED",
);
assert.doesNotMatch(html, /lorem ipsum|placeholder|coming soon|todo/i, "PLACEHOLDER_COPY_FORBIDDEN");
assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i, "REMOTE_SCRIPT_FORBIDDEN");
assert.doesNotMatch(html, /<link[^>]+href=["']https?:\/\//i, "REMOTE_STYLESHEET_FORBIDDEN");

assert.ok(css.length >= 1200, "LANDING_PAGE_CSS_TOO_THIN");
assert.match(css, /@media\s*\(/i, "RESPONSIVE_MEDIA_QUERY_REQUIRED");
assert.match(css, /display\s*:\s*(grid|flex)/i, "MODERN_LAYOUT_REQUIRED");
assert.match(css, /:hover|:focus-visible/i, "INTERACTION_STATE_REQUIRED");
assert.doesNotMatch(css, /url\(["']?https?:\/\//i, "REMOTE_CSS_ASSET_FORBIDDEN");

assert.doesNotMatch(buildSource, /child_process|\bexec\b|\bspawn\b|\bcurl\b|\bwget\b/i, "BUILD_SHELL_ESCAPE_FORBIDDEN");
assert.doesNotMatch(buildSource, /https?:\/\//i, "BUILD_NETWORK_ACCESS_FORBIDDEN");
assert.match(buildSource, /AVANTIQO_CODE_LANDING_BUILD_OUTPUT/, "BUILD_OUTPUT_ENV_CONTRACT_REQUIRED");

await rm(BUILD_OUTPUT, { force: true });
const build = spawnSync(process.execPath, [path.join(APP_ROOT, "build.mjs")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AVANTIQO_CODE_LANDING_BUILD_OUTPUT: BUILD_OUTPUT,
  },
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
assert.equal(
  build.status,
  0,
  `LANDING_PAGE_BUILD_FAILED\nstdout=${String(build.stdout || "").slice(0, 1200)}\nstderr=${String(build.stderr || "").slice(0, 1200)}`,
);

const built = await readFile(BUILD_OUTPUT, "utf8");
assert.ok(built.length >= 2500, "BUILT_PAGE_TOO_SMALL");
assert.match(built, /<!doctype html>/i, "BUILT_DOCTYPE_REQUIRED");
assert.match(built, /<style[\s>][\s\S]*<\/style>/i, "BUILT_INLINE_STYLE_REQUIRED");
assert.match(built, /<h1[\s>][\s\S]*?<\/h1>/i, "BUILT_HERO_REQUIRED");
assert.doesNotMatch(built, /styles\.css/i, "BUILT_PAGE_MUST_BE_STANDALONE");
assert.doesNotMatch(built, /lorem ipsum|placeholder|coming soon|todo/i, "BUILT_PLACEHOLDER_COPY_FORBIDDEN");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  app_root: APP_ROOT,
  build_output: BUILD_OUTPUT,
  source_html_bytes: Buffer.byteLength(html, "utf8"),
  source_css_bytes: Buffer.byteLength(css, "utf8"),
  built_html_bytes: Buffer.byteLength(built, "utf8"),
  semantic_landing_page_verified: true,
  responsive_design_verified: true,
  multiple_ctas_verified: true,
  standalone_build_verified: true,
  external_network_required: false,
  source_mutation_performed_by_verifier: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
