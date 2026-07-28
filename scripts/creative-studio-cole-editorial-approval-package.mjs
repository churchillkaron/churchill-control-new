#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import nextEnv from "@next/env";
import sharp from "sharp";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const REPAIR_VERSION = "cole-dense-canonical-evidence-repair-v1";
const PACKAGE_VERSION = "cole-editorial-approval-package-v1";
const EXPECTED_CANDIDATES = 14;
const EXPECTED_MOMENTS = 24;
const MASTER_DURATION_SECONDS = 180;
const PERFORMANCE_TARGET_SECONDS = 72;
const NARRATIVE_TARGET_SECONDS = MASTER_DURATION_SECONDS - PERFORMANCE_TARGET_SECONDS;
const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 540;
const CONTACT_CARD_WIDTH = 640;
const CONTACT_CARD_HEIGHT = 420;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function sum(values) {
  return Number(values.reduce((total, value) => total + finite(value), 0).toFixed(6));
}

function average(values = [], fallback = 0) {
  const numbers = values
    .map((value) => finite(value, null))
    .filter((value) => value !== null);
  if (!numbers.length) return fallback;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function safeName(value, fallback = "item") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSeconds(value) {
  const seconds = Math.max(0, finite(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

function formatClock(value) {
  const seconds = Math.max(0, finite(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds - minutes * 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function svgEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        code: Number.isInteger(code) ? code : 1,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (!allowFailure && (signal || result.code !== 0)) {
        reject(new Error(
          result.stderr || result.stdout ||
          `${command} failed with ${signal || result.code}`,
        ));
        return;
      }
      resolve(result);
    });
  });
}

async function assertExecutable(command) {
  const result = await run(command, ["-version"], { allowFailure: true });
  if (result.code !== 0) throw new Error(`${command.toUpperCase()}_REQUIRED`);
}

function exactRange(value = {}) {
  const source = object(value);
  const start = finite(source.start_seconds, -1);
  const end = finite(source.end_seconds, -1);
  const suppliedDuration = finite(source.duration_seconds, -1);
  const duration = end > start ? end - start : suppliedDuration;
  if (start < 0 || duration <= 0) return null;
  return {
    start_seconds: Number(start.toFixed(6)),
    end_seconds: Number((start + duration).toFixed(6)),
    duration_seconds: Number(duration.toFixed(6)),
  };
}

function heroRanges(moment) {
  return (Array.isArray(moment.metadata?.hero_subranges)
    ? moment.metadata.hero_subranges
    : [])
    .map((entry) => exactRange(entry?.original_source_range))
    .filter(Boolean);
}

function representativeTime(moment) {
  const range = exactRange(moment.metadata?.original_source_range);
  if (!range) return 0;
  const heroes = heroRanges(moment);
  if (heroes.length) {
    const strongest = [...heroes].sort(
      (left, right) => right.duration_seconds - left.duration_seconds,
    )[0];
    return Number(((strongest.start_seconds + strongest.end_seconds) / 2).toFixed(6));
  }
  return Number(((range.start_seconds + range.end_seconds) / 2).toFixed(6));
}

function momentScore(moment) {
  const evidence = object(moment.metadata?.performance_evidence);
  const heroDuration = sum(heroRanges(moment).map((range) => range.duration_seconds));
  return Number(clamp(
    finite(moment.metadata?.score, moment.intelligence?.reuse_score) * 0.45 +
    finite(evidence.quality_score, moment.intelligence?.quality_score) * 0.25 +
    finite(evidence.face_visibility_score) * 0.15 +
    finite(evidence.performance_energy_score) * 0.15 +
    Math.min(10, heroDuration),
  ).toFixed(3));
}

function chooseSourceCut(moment, requestedDuration) {
  const source = exactRange(moment.metadata?.original_source_range);
  if (!source) throw new Error(`MOMENT_RANGE_REQUIRED:${moment.id}`);
  const duration = Math.max(1.5, Math.min(
    source.duration_seconds,
    finite(requestedDuration, source.duration_seconds),
  ));
  const heroes = heroRanges(moment);
  const centre = heroes.length
    ? (heroes[0].start_seconds + heroes[0].end_seconds) / 2
    : (source.start_seconds + source.end_seconds) / 2;
  let start = centre - duration / 2;
  start = Math.max(source.start_seconds, Math.min(start, source.end_seconds - duration));
  return {
    start_seconds: Number(start.toFixed(6)),
    end_seconds: Number((start + duration).toFixed(6)),
    duration_seconds: Number(duration.toFixed(6)),
  };
}

function proposalSections() {
  return [
    {
      section: 1,
      start_seconds: 0,
      end_seconds: 15,
      title: "Cold open — the unanswered signal",
      narrative_purpose:
        "Introduce the story world and a human question before revealing the stage.",
      performance_target_seconds: 0,
      visual_direction:
        "Original narrative imagery, restrained camera movement, environmental sound and one unresolved visual motif.",
    },
    {
      section: 2,
      start_seconds: 15,
      end_seconds: 36,
      title: "First glimpse — the voice enters",
      narrative_purpose:
        "Reveal Cole as the emotional source without abandoning the story protagonist.",
      performance_target_seconds: 8,
      visual_direction:
        "Brief hero close-ups intercut with the protagonist responding to the first musical signal.",
    },
    {
      section: 3,
      start_seconds: 36,
      end_seconds: 60,
      title: "The journey begins",
      narrative_purpose:
        "Move the protagonist toward a choice, destination or memory connected to the song.",
      performance_target_seconds: 4,
      visual_direction:
        "Narrative-led movement with short performance punctuation and visual echoes between both worlds.",
    },
    {
      section: 4,
      start_seconds: 60,
      end_seconds: 88,
      title: "First chorus — stage becomes the pulse",
      narrative_purpose:
        "Let the performance carry momentum while the story advances through decisive action.",
      performance_target_seconds: 18,
      visual_direction:
        "Hero and medium performance coverage, rhythmic cutting, practical light transitions and motivated story inserts.",
    },
    {
      section: 5,
      start_seconds: 88,
      end_seconds: 116,
      title: "Story turn — choice and consequence",
      narrative_purpose:
        "Deliver the emotional reversal or discovery that changes the protagonist's direction.",
      performance_target_seconds: 8,
      visual_direction:
        "Longer narrative shots, selective performance reactions and one memorable symbolic image.",
    },
    {
      section: 6,
      start_seconds: 116,
      end_seconds: 145,
      title: "Second build — worlds begin to merge",
      narrative_purpose:
        "Connect story action and live performance so they feel causally linked rather than merely intercut.",
      performance_target_seconds: 14,
      visual_direction:
        "Match cuts, light and movement continuity, escalating performance energy and tighter camera proximity.",
    },
    {
      section: 7,
      start_seconds: 145,
      end_seconds: 174,
      title: "Climax — full live energy",
      narrative_purpose:
        "Resolve the protagonist's central choice at the same time as the strongest vocal and visual performance peak.",
      performance_target_seconds: 18,
      visual_direction:
        "Best hero footage, faster but readable cutting, emotional narrative payoff and one sustained final performance beat.",
    },
    {
      section: 8,
      start_seconds: 174,
      end_seconds: 180,
      title: "Resolution — image, breath, silence",
      narrative_purpose:
        "Leave one clear emotional conclusion rather than ending on a generic montage.",
      performance_target_seconds: 2,
      visual_direction:
        "One final performance image or reaction, then the story's closing visual motif.",
    },
  ];
}

function buildTimelineProposal(moments) {
  const sections = proposalSections();
  const ranked = [...moments].sort((left, right) => {
    const heroDifference = heroRanges(right).length - heroRanges(left).length;
    if (heroDifference) return heroDifference;
    return momentScore(right) - momentScore(left);
  });
  const unused = new Set(ranked.map((moment) => String(moment.id)));
  const allocations = [];

  for (const section of sections) {
    let remaining = section.performance_target_seconds;
    const sectionCuts = [];
    while (remaining > 0.01) {
      const candidates = ranked.filter((moment) => unused.has(String(moment.id)));
      if (!candidates.length) break;
      const preferred = section.section >= 4
        ? candidates.find((moment) => heroRanges(moment).length > 0) || candidates[0]
        : candidates[0];
      const source = exactRange(preferred.metadata?.original_source_range);
      const requested = Math.min(6, remaining, source?.duration_seconds || remaining);
      const cut = chooseSourceCut(preferred, requested);
      const candidateId = text(preferred.metadata?.local_shortlist_candidate_id);
      const candidate = object(preferred._candidate);
      sectionCuts.push({
        order: sectionCuts.length + 1,
        moment_id: preferred.id,
        candidate_id: candidateId,
        candidate_rank: finite(candidate.metadata?.shortlist_rank, null),
        source_asset_node_id: preferred.metadata?.source_asset_node_id,
        source_cut: cut,
        original_verified_range: source,
        editorial_score: momentScore(preferred),
        contains_hero_range: heroRanges(preferred).length > 0,
        intended_role: section.section >= 4 && heroRanges(preferred).length
          ? "HERO_PERFORMANCE"
          : "PERFORMANCE",
      });
      unused.delete(String(preferred.id));
      remaining = Number((remaining - cut.duration_seconds).toFixed(6));
    }
    allocations.push({
      ...section,
      narrative_seconds: Number((
        section.end_seconds - section.start_seconds -
        sectionCuts.reduce((total, cut) => total + cut.source_cut.duration_seconds, 0)
      ).toFixed(6)),
      performance_cuts: sectionCuts,
      allocated_performance_seconds: Number(sectionCuts.reduce(
        (total, cut) => total + cut.source_cut.duration_seconds,
        0,
      ).toFixed(6)),
      allocation_shortfall_seconds: Math.max(0, Number(remaining.toFixed(6))),
    });
  }

  const allocatedPerformance = sum(
    allocations.map((section) => section.allocated_performance_seconds),
  );
  return {
    version: "three-minute-story-performance-structure-v1",
    status: "PROPOSED_FOR_HUMAN_REVIEW",
    master_duration_seconds: MASTER_DURATION_SECONDS,
    target_performance_seconds: PERFORMANCE_TARGET_SECONDS,
    target_narrative_seconds: NARRATIVE_TARGET_SECONDS,
    allocated_performance_seconds: allocatedPerformance,
    allocated_narrative_seconds: Number((
      MASTER_DURATION_SECONDS - allocatedPerformance
    ).toFixed(6)),
    allocation_shortfall_seconds: Number((
      PERFORMANCE_TARGET_SECONDS - allocatedPerformance
    ).toFixed(6)),
    story_principle:
      "The narrative must have its own protagonist, objective, reversal and resolution. Live performance acts as the emotional force inside the story, not as filler between unrelated images.",
    lyric_alignment_required_before_production: true,
    generated_story_assets_required_before_production: true,
    sections: allocations,
  };
}

async function extractFrame({ input, timestamp, output }) {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(timestamp),
    "-i", input,
    "-frames:v", "1",
    "-vf",
    `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    "-q:v", "2",
    "-y",
    output,
  ]);
}

async function extractPreviewClip({ input, range, output }) {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(range.start_seconds),
    "-i", input,
    "-t", String(range.duration_seconds),
    "-vf",
    `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    output,
  ]);
}

function labelSvg({ width, height, lines }) {
  const escaped = lines.map(svgEscape);
  const lineHeight = 25;
  const labelHeight = Math.min(height, 28 + escaped.length * lineHeight);
  const textLines = escaped.map((line, index) =>
    `<text x="18" y="${height - labelHeight + 30 + index * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#f7ead7">${line}</text>`,
  ).join("");
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${height - labelHeight}" width="${width}" height="${labelHeight}" fill="rgba(10,10,12,0.88)"/>
      <rect x="0" y="${height - labelHeight}" width="7" height="${labelHeight}" fill="#d6a66a"/>
      ${textLines}
    </svg>
  `);
}

async function labelledCard({ imagePath, outputPath, lines }) {
  await sharp(imagePath)
    .resize(CONTACT_CARD_WIDTH, CONTACT_CARD_HEIGHT, {
      fit: "contain",
      background: "#050506",
    })
    .composite([{
      input: labelSvg({
        width: CONTACT_CARD_WIDTH,
        height: CONTACT_CARD_HEIGHT,
        lines,
      }),
      top: 0,
      left: 0,
    }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

async function contactSheet({ cards, outputPath, title }) {
  const columns = 2;
  const rows = Math.max(1, Math.ceil(cards.length / columns));
  const headerHeight = 90;
  const width = columns * CONTACT_CARD_WIDTH;
  const height = headerHeight + rows * CONTACT_CARD_HEIGHT;
  const background = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#08080a",
    },
  }).png().toBuffer();
  const titleSvg = Buffer.from(`
    <svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${headerHeight}" fill="#08080a"/>
      <text x="28" y="53" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#f6ead9">${svgEscape(title)}</text>
      <rect x="28" y="68" width="170" height="3" fill="#d6a66a"/>
    </svg>
  `);
  const composites = [{ input: titleSvg, top: 0, left: 0 }];
  for (let index = 0; index < cards.length; index += 1) {
    composites.push({
      input: cards[index],
      top: headerHeight + Math.floor(index / columns) * CONTACT_CARD_HEIGHT,
      left: (index % columns) * CONTACT_CARD_WIDTH,
    });
  }
  await sharp(background)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

function reviewHtml({ projectName, manifest }) {
  const cards = manifest.moments.map((moment) => `
    <article class="card" data-rank="${moment.candidate_rank}" data-score="${moment.editorial_score}" data-hero="${moment.hero_duration_seconds > 0 ? 1 : 0}">
      <div class="media">
        <img src="${escapeHtml(moment.thumbnail_relative_path)}" alt="Range ${moment.review_number}">
        <video controls preload="metadata" src="${escapeHtml(moment.preview_clip_relative_path)}"></video>
      </div>
      <div class="body">
        <div class="eyebrow">RANGE ${String(moment.review_number).padStart(2, "0")} · CANDIDATE ${moment.candidate_rank}</div>
        <h3>${escapeHtml(moment.editorial_role)}</h3>
        <dl>
          <div><dt>Source</dt><dd>${escapeHtml(formatSeconds(moment.source_range.start_seconds))}–${escapeHtml(formatSeconds(moment.source_range.end_seconds))}</dd></div>
          <div><dt>Duration</dt><dd>${moment.source_range.duration_seconds.toFixed(3)} sec</dd></div>
          <div><dt>Score</dt><dd>${moment.editorial_score.toFixed(1)}</dd></div>
          <div><dt>Hero</dt><dd>${moment.hero_duration_seconds.toFixed(3)} sec</dd></div>
        </dl>
        <div class="decision">
          <label><input type="radio" name="decision-${moment.id}" value="APPROVE"> Approve</label>
          <label><input type="radio" name="decision-${moment.id}" value="HOLD" checked> Hold</label>
          <label><input type="radio" name="decision-${moment.id}" value="REJECT"> Reject</label>
        </div>
        <textarea placeholder="Editorial notes for this range"></textarea>
        <code>${escapeHtml(moment.id)}</code>
      </div>
    </article>
  `).join("\n");

  const timeline = manifest.timeline.sections.map((section) => `
    <tr>
      <td>${section.section}</td>
      <td>${formatClock(section.start_seconds)}–${formatClock(section.end_seconds)}</td>
      <td><strong>${escapeHtml(section.title)}</strong><br><span>${escapeHtml(section.narrative_purpose)}</span></td>
      <td>${section.allocated_performance_seconds.toFixed(1)} sec</td>
      <td>${section.narrative_seconds.toFixed(1)} sec</td>
      <td>${section.performance_cuts.map((cut) => `R${String(cut.review_number || 0).padStart(2, "0")}`).join(", ") || "—"}</td>
    </tr>
  `).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(projectName)} — Editorial Approval</title>
<style>
:root{color-scheme:dark;--bg:#050506;--panel:#101014;--line:#2a2520;--gold:#d6a66a;--text:#f5ecdf;--muted:#a9a099}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#17130f 0,#050506 38%);color:var(--text);font-family:Inter,Arial,sans-serif;font-weight:300}
header{padding:48px 5vw 30px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(5,5,6,.94);backdrop-filter:blur(16px);z-index:10}
h1{font-size:clamp(28px,4vw,58px);font-weight:300;letter-spacing:-.03em;margin:0 0 12px}.gold{color:var(--gold)}.sub{color:var(--muted);max-width:1100px;line-height:1.6}
.metrics{display:flex;gap:24px;flex-wrap:wrap;margin-top:20px}.metric{border-left:2px solid var(--gold);padding-left:12px}.metric b{display:block;font-size:24px;font-weight:400}.metric span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}
main{padding:32px 5vw 70px}.controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}button{background:#151519;color:var(--text);border:1px solid var(--line);padding:10px 14px;border-radius:999px;cursor:pointer}button:hover{border-color:var(--gold)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:22px}.card{background:linear-gradient(180deg,rgba(22,22,27,.94),rgba(10,10,13,.94));border:1px solid var(--line);border-radius:18px;overflow:hidden}.media{display:grid;grid-template-columns:1fr 1fr;background:#000}.media img,.media video{width:100%;height:230px;object-fit:contain;background:#000}.body{padding:20px}.eyebrow{color:var(--gold);font-size:11px;letter-spacing:.15em}.body h3{font-weight:400;margin:8px 0 14px}.body dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0}.body dl div{background:#0b0b0e;padding:10px;border-radius:10px}.body dt{font-size:10px;color:var(--muted);text-transform:uppercase}.body dd{margin:5px 0 0}.decision{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0 10px}.decision label{font-size:13px}textarea{width:100%;min-height:78px;background:#09090b;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px}code{display:block;margin-top:10px;color:#766e67;font-size:10px;overflow-wrap:anywhere}
section{margin-top:56px}h2{font-weight:300;font-size:34px}table{width:100%;border-collapse:collapse;background:rgba(12,12,15,.92);border:1px solid var(--line)}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--gold);font-size:11px;text-transform:uppercase;letter-spacing:.1em}td span{color:var(--muted);line-height:1.5}.notice{border:1px solid var(--gold);padding:18px;border-radius:14px;color:var(--muted)}
@media(max-width:800px){header{position:relative}.media{grid-template-columns:1fr}.media img,.media video{height:260px}table{font-size:12px}}
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(projectName)} <span class="gold">Editorial Approval</span></h1>
  <div class="sub">Review-only package generated from saved, paid semantic evidence. No production render has started. Every range remains unapproved until a human decision is recorded.</div>
  <div class="metrics">
    <div class="metric"><b>${manifest.moments.length}</b><span>verified ranges</span></div>
    <div class="metric"><b>${manifest.performance_duration_seconds.toFixed(1)}s</b><span>performance evidence</span></div>
    <div class="metric"><b>${manifest.hero_duration_seconds.toFixed(1)}s</b><span>hero evidence</span></div>
    <div class="metric"><b>${manifest.timeline.allocated_performance_seconds.toFixed(1)}s</b><span>proposed final performance</span></div>
  </div>
</header>
<main>
  <div class="notice"><strong>Approval gate:</strong> this page is a visual review surface only. Mark decisions here for discussion, then record the approved range IDs through the controlled approval action. Generated narrative scenes and lyric alignment are still required before production.</div>
  <div class="controls">
    <button onclick="sortCards('rank')">Sort by candidate</button>
    <button onclick="sortCards('score')">Sort by score</button>
    <button onclick="sortCards('hero')">Hero first</button>
  </div>
  <div class="grid" id="cards">${cards}</div>
  <section>
    <h2>Proposed three-minute structure</h2>
    <p class="sub">${escapeHtml(manifest.timeline.story_principle)}</p>
    <table>
      <thead><tr><th>#</th><th>Master time</th><th>Story function</th><th>Performance</th><th>Narrative</th><th>Proposed ranges</th></tr></thead>
      <tbody>${timeline}</tbody>
    </table>
  </section>
  <section>
    <h2>Contact sheets</h2>
    <div class="grid">${manifest.contact_sheets.map((sheet) => `<a class="card" href="${escapeHtml(sheet.relative_path)}"><div class="body"><div class="eyebrow">CANDIDATE ${sheet.candidate_rank}</div><h3>Open contact sheet</h3><p class="sub">${sheet.range_count} verified range${sheet.range_count === 1 ? "" : "s"}</p></div></a>`).join("")}</div>
  </section>
</main>
<script>
function sortCards(mode){
  const root=document.getElementById('cards');
  const cards=[...root.children];
  cards.sort((a,b)=>{
    if(mode==='score')return Number(b.dataset.score)-Number(a.dataset.score);
    if(mode==='hero')return Number(b.dataset.hero)-Number(a.dataset.hero)||Number(b.dataset.score)-Number(a.dataset.score);
    return Number(a.dataset.rank)-Number(b.dataset.rank);
  });
  cards.forEach(card=>root.appendChild(card));
}
</script>
</body>
</html>`;
}

const organizationId = text(
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID ||
  process.env.COLE_LEY_ORGANIZATION_ID,
);
const projectId = text(process.env.COLE_LEY_PROJECT_ID);
const shortlistIdentity = text(process.env.COLE_LEY_PROJECT_SHORTLIST_IDENTITY);
const planIdentity = text(process.env.COLE_LEY_DENSE_PLAN_IDENTITY);

if (!organizationId) throw new Error("CREATIVE_SMOKE_ORGANIZATION_ID required");
if (!projectId) throw new Error("COLE_LEY_PROJECT_ID required");
if (!shortlistIdentity) throw new Error("COLE_LEY_PROJECT_SHORTLIST_IDENTITY required");
if (!planIdentity) throw new Error("COLE_LEY_DENSE_PLAN_IDENTITY required");

await assertExecutable("ffmpeg");

const {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} = await import("@/lib/creative/assets/graph/documents/CreativeAssetNode");
const AssetGraphRepository = await import(
  "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
);
const { materializeMedia } = await import(
  "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime"
);

const nodes = await AssetGraphRepository.listByProject({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
const projectNode = nodes.find((node) =>
  node.type === "PROJECT" || node.metadata?.project_record === true
) || null;
const projectName = text(
  projectNode?.name ||
  process.env.COLE_LEY_PROJECT_NAME ||
  "Cole Ley — Three-Minute Live Performance Showreel",
);

const candidates = nodes
  .filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.metadata?.local_shortlist_candidate === true &&
    node.metadata?.selected_for_ai_verification === true &&
    node.metadata?.project_shortlist_identity === shortlistIdentity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  )
  .sort((left, right) =>
    finite(left.metadata?.shortlist_rank, 9999) -
    finite(right.metadata?.shortlist_rank, 9999)
  );
if (candidates.length !== EXPECTED_CANDIDATES) {
  throw new Error(`COLE_APPROVAL_CANDIDATE_COUNT_MISMATCH:${candidates.length}`);
}
const candidateById = new Map(candidates.map((candidate) => [String(candidate.id), candidate]));

const moments = nodes
  .filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.metadata?.canonical_evidence_repair_version === REPAIR_VERSION &&
    node.metadata?.canonical_evidence_repair === true &&
    node.metadata?.performance_verified === true &&
    node.metadata?.local_shortlist_candidate !== true &&
    node.metadata?.project_shortlist_identity === shortlistIdentity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  )
  .map((moment) => ({
    ...moment,
    _candidate: candidateById.get(String(moment.metadata?.local_shortlist_candidate_id)) || null,
  }))
  .sort((left, right) => {
    const rankDifference =
      finite(left._candidate?.metadata?.shortlist_rank, 9999) -
      finite(right._candidate?.metadata?.shortlist_rank, 9999);
    if (rankDifference) return rankDifference;
    return finite(left.metadata?.original_source_range?.start_seconds) -
      finite(right.metadata?.original_source_range?.start_seconds);
  });
if (moments.length !== EXPECTED_MOMENTS) {
  throw new Error(`COLE_APPROVAL_MOMENT_COUNT_MISMATCH:${moments.length}`);
}
if (moments.some((moment) => !moment._candidate)) {
  throw new Error("COLE_APPROVAL_CANDIDATE_LINK_MISSING");
}
if (moments.some((moment) =>
  moment.review?.approved === true ||
  moment.review?.human_reviewed === true ||
  moment.metadata?.production_started === true
)) {
  throw new Error("COLE_APPROVAL_PACKAGE_REQUIRES_LOCKED_MOMENTS");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.resolve(
  text(process.env.COLE_APPROVAL_OUTPUT_DIR) ||
  path.join(os.homedir(), "Desktop", `AVANTIQO_COLE_EDITORIAL_APPROVAL_${timestamp}`),
);
const framesDir = path.join(outputRoot, "frames");
const clipsDir = path.join(outputRoot, "preview-clips");
const cardsDir = path.join(outputRoot, "cards");
const sheetsDir = path.join(outputRoot, "contact-sheets");
await Promise.all([
  fs.mkdir(framesDir, { recursive: true }),
  fs.mkdir(clipsDir, { recursive: true }),
  fs.mkdir(cardsDir, { recursive: true }),
  fs.mkdir(sheetsDir, { recursive: true }),
]);

const materialized = new Map();
async function sourceFile(sourceNodeId) {
  const key = String(sourceNodeId || "");
  if (!key) throw new Error("COLE_APPROVAL_SOURCE_NODE_ID_REQUIRED");
  if (materialized.has(key)) return materialized.get(key);
  const node = nodeById.get(key);
  if (!node?.url) throw new Error(`COLE_APPROVAL_SOURCE_NODE_URL_REQUIRED:${key}`);
  const media = await materializeMedia({
    url: node.url,
    file_name: node.name || node.storage_path || "source-video.mp4",
    mime_type: node.technical?.mime_type || "video/mp4",
    organization_id: organizationId,
    policy: {
      max_bytes: finite(process.env.CREATIVE_MEDIA_MAX_INSPECTION_BYTES, 4_000_000_000),
      timeout_ms: finite(process.env.CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS, 600_000),
      max_redirects: 2,
    },
  });
  materialized.set(key, media);
  return media;
}

const manifestMoments = [];
const cardsByCandidate = new Map();
try {
  for (let index = 0; index < moments.length; index += 1) {
    const moment = moments[index];
    const reviewNumber = index + 1;
    const candidateRank = finite(moment._candidate.metadata?.shortlist_rank, 9999);
    const sourceRange = exactRange(moment.metadata?.original_source_range);
    if (!sourceRange) throw new Error(`COLE_APPROVAL_RANGE_REQUIRED:${moment.id}`);
    const sourceNodeId = text(moment.metadata?.source_asset_node_id);
    const source = await sourceFile(sourceNodeId);
    const stem = `${String(reviewNumber).padStart(2, "0")}-candidate-${String(candidateRank).padStart(2, "0")}-${safeName(moment.id)}`;
    const framePath = path.join(framesDir, `${stem}.jpg`);
    const clipPath = path.join(clipsDir, `${stem}.mp4`);
    const cardPath = path.join(cardsDir, `${stem}.jpg`);
    await extractFrame({
      input: source.file_path,
      timestamp: representativeTime(moment),
      output: framePath,
    });
    await extractPreviewClip({
      input: source.file_path,
      range: sourceRange,
      output: clipPath,
    });
    const heroes = heroRanges(moment);
    const score = momentScore(moment);
    const role = heroes.length ? "PERFORMANCE WITH HERO COVERAGE" : "PERFORMANCE COVERAGE";
    await labelledCard({
      imagePath: framePath,
      outputPath: cardPath,
      lines: [
        `Range ${String(reviewNumber).padStart(2, "0")} · Candidate ${candidateRank} · ${role}`,
        `${formatSeconds(sourceRange.start_seconds)}–${formatSeconds(sourceRange.end_seconds)} · ${sourceRange.duration_seconds.toFixed(3)} sec`,
        `Editorial score ${score.toFixed(1)} · Hero ${sum(heroes.map((range) => range.duration_seconds)).toFixed(3)} sec`,
      ],
    });
    if (!cardsByCandidate.has(candidateRank)) cardsByCandidate.set(candidateRank, []);
    cardsByCandidate.get(candidateRank).push(cardPath);
    manifestMoments.push({
      review_number: reviewNumber,
      id: moment.id,
      candidate_id: moment.metadata?.local_shortlist_candidate_id,
      candidate_rank: candidateRank,
      source_asset_node_id: sourceNodeId,
      editorial_role: role,
      editorial_score: score,
      source_range: sourceRange,
      hero_ranges: heroes,
      hero_duration_seconds: sum(heroes.map((range) => range.duration_seconds)),
      representative_time_seconds: representativeTime(moment),
      thumbnail_relative_path: path.relative(outputRoot, cardPath),
      preview_clip_relative_path: path.relative(outputRoot, clipPath),
      human_decision: "HOLD",
      human_notes: "",
      production_started: false,
    });
  }
} finally {
  for (const media of materialized.values()) {
    await media.cleanup().catch(() => null);
  }
}

const contactSheets = [];
for (const candidate of candidates) {
  const rank = finite(candidate.metadata?.shortlist_rank, 9999);
  const cards = cardsByCandidate.get(rank) || [];
  if (!cards.length) continue;
  const sheetPath = path.join(
    sheetsDir,
    `candidate-${String(rank).padStart(2, "0")}-contact-sheet.jpg`,
  );
  await contactSheet({
    cards,
    outputPath: sheetPath,
    title: `Cole Ley · Candidate ${rank} · ${cards.length} verified range${cards.length === 1 ? "" : "s"}`,
  });
  contactSheets.push({
    candidate_id: candidate.id,
    candidate_rank: rank,
    range_count: cards.length,
    relative_path: path.relative(outputRoot, sheetPath),
  });
}

const momentsForTimeline = moments.map((moment) => ({
  ...moment,
  _candidate: candidateById.get(String(moment.metadata?.local_shortlist_candidate_id)),
}));
const timeline = buildTimelineProposal(momentsForTimeline);
const reviewNumberByMoment = new Map(
  manifestMoments.map((moment) => [String(moment.id), moment.review_number]),
);
for (const section of timeline.sections) {
  for (const cut of section.performance_cuts) {
    cut.review_number = reviewNumberByMoment.get(String(cut.moment_id)) || null;
  }
}

const performanceDuration = sum(manifestMoments.map((moment) => moment.source_range.duration_seconds));
const heroDuration = sum(manifestMoments.map((moment) => moment.hero_duration_seconds));
const manifest = {
  package_version: PACKAGE_VERSION,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  project_name: projectName,
  project_shortlist_identity: shortlistIdentity,
  dense_semantic_plan_identity: planIdentity,
  canonical_repair_version: REPAIR_VERSION,
  review_status: "AWAITING_HUMAN_EDITORIAL_APPROVAL",
  human_approval_required: true,
  production_started: false,
  provider_calls_executed: 0,
  wallet_charges_created: 0,
  database_writes: 0,
  candidate_count: candidates.length,
  moment_count: manifestMoments.length,
  performance_duration_seconds: performanceDuration,
  hero_duration_seconds: heroDuration,
  contact_sheets: contactSheets,
  moments: manifestMoments,
  timeline,
};

const decisions = {
  package_version: PACKAGE_VERSION,
  creative_project_id: projectId,
  status: "DRAFT",
  approved_by: null,
  approved_at: null,
  overall_decision: "HOLD",
  story_structure_decision: "HOLD",
  production_authorized: false,
  notes: "",
  range_decisions: manifestMoments.map((moment) => ({
    moment_id: moment.id,
    review_number: moment.review_number,
    candidate_rank: moment.candidate_rank,
    decision: "HOLD",
    allowed_roles: [],
    notes: "",
  })),
};

const readme = [
  "AVANTIQO — COLE LEY EDITORIAL APPROVAL PACKAGE",
  "================================================",
  "",
  `Project: ${projectName}`,
  `Generated: ${manifest.generated_at}`,
  `Verified ranges: ${manifest.moment_count}`,
  `Performance evidence: ${manifest.performance_duration_seconds.toFixed(3)} seconds`,
  `Hero evidence: ${manifest.hero_duration_seconds.toFixed(3)} seconds`,
  `Proposed final performance allocation: ${timeline.allocated_performance_seconds.toFixed(3)} seconds`,
  `Proposed generated narrative allocation: ${timeline.allocated_narrative_seconds.toFixed(3)} seconds`,
  "",
  "Open index.html in a browser to review every range.",
  "Edit approval-decisions.json only after the visual review.",
  "Do not set production_authorized=true until the story, song alignment and selected ranges are approved.",
  "",
  "This package executed no provider calls, created no wallet charges and wrote nothing to the database.",
].join("\n");

await Promise.all([
  fs.writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(outputRoot, "approval-decisions.json"),
    `${JSON.stringify(decisions, null, 2)}\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(outputRoot, "story-timeline-proposal.json"),
    `${JSON.stringify(timeline, null, 2)}\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(outputRoot, "README.txt"),
    `${readme}\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(outputRoot, "index.html"),
    reviewHtml({ projectName, manifest }),
    "utf8",
  ),
]);

console.log("============================================================");
console.log("COLE EDITORIAL APPROVAL PACKAGE COMPLETE");
console.log("============================================================");
console.log(`PACKAGE_VERSION=${PACKAGE_VERSION}`);
console.log(`PACKAGE_DIR=${outputRoot}`);
console.log(`INDEX_HTML=${path.join(outputRoot, "index.html")}`);
console.log(`MANIFEST_JSON=${path.join(outputRoot, "manifest.json")}`);
console.log(`APPROVAL_DECISIONS_JSON=${path.join(outputRoot, "approval-decisions.json")}`);
console.log(`STORY_TIMELINE_JSON=${path.join(outputRoot, "story-timeline-proposal.json")}`);
console.log(`CANDIDATE_COUNT=${candidates.length}`);
console.log(`CONTACT_SHEET_COUNT=${contactSheets.length}`);
console.log(`PREVIEW_CLIP_COUNT=${manifestMoments.length}`);
console.log(`VERIFIED_RANGE_COUNT=${manifestMoments.length}`);
console.log(`PERFORMANCE_EVIDENCE_SECONDS=${performanceDuration}`);
console.log(`HERO_EVIDENCE_SECONDS=${heroDuration}`);
console.log(`PROPOSED_MASTER_DURATION_SECONDS=${MASTER_DURATION_SECONDS}`);
console.log(`PROPOSED_PERFORMANCE_SECONDS=${timeline.allocated_performance_seconds}`);
console.log(`PROPOSED_NARRATIVE_SECONDS=${timeline.allocated_narrative_seconds}`);
console.log(`TIMELINE_ALLOCATION_SHORTFALL_SECONDS=${timeline.allocation_shortfall_seconds}`);
console.log("HUMAN_APPROVAL_REQUIRED=YES");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES_CREATED=0");
console.log("DATABASE_WRITES=0");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");
