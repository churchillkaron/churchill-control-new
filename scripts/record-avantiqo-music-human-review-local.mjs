import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const REVIEW_CONTRACT = "AVANTIQO_MUSIC_HUMAN_REVIEW_V1";
const INPUT = resolve(
  process.env.AVANTIQO_MUSIC_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-human-review.json",
);
const OUTPUT = INPUT;

function text(value) {
  return String(value ?? "").trim();
}

function validScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

async function askRequired(rl, prompt, minimumLength = 1) {
  while (true) {
    const value = text(await rl.question(prompt));
    if (value.length >= minimumLength) return value;
    console.log(`Value must contain at least ${minimumLength} character${minimumLength === 1 ? "" : "s"}.`);
  }
}

async function askScore(rl, label, minimum) {
  while (true) {
    const raw = await rl.question(`${label} score 0-100 (minimum ${minimum}): `);
    const score = validScore(raw);
    if (score !== null) return score;
    console.log("Enter a numeric score from 0 to 100.");
  }
}

const review = JSON.parse(await readFile(INPUT, "utf8"));
if (text(review?.contract) !== REVIEW_CONTRACT) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_CONTRACT_INVALID");
}
if (review?.automatic_human_approval_forbidden !== true || review?.activation_allowed !== false) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_POLICY_INVALID");
}
const items = Array.isArray(review?.items) ? review.items : [];
if (!items.length) throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_ITEMS_REQUIRED");

const rl = createInterface({ input, output });
try {
  console.log("AVANTIQO MUSIC HUMAN QUALITY REVIEW");
  console.log(`Benchmark: ${text(review.benchmark_id) || "UNKNOWN"}`);
  console.log(`Quality profile: ${text(review.quality_profile) || "UNKNOWN"}`);
  console.log("Automatic approval is forbidden. Your scores are the human review evidence.\n");

  const reviewer = text(process.env.AVANTIQO_MUSIC_HUMAN_REVIEWER) ||
    await askRequired(rl, "Reviewer name: ", 2);
  const reviewedAt = new Date().toISOString();
  let allItemsPass = true;

  for (const item of items) {
    console.log(`\n--- Run ${item.run ?? "UNKNOWN"} ---`);
    console.log(`Duration: ${item.duration_seconds ?? "UNKNOWN"} seconds`);
    console.log(`Storage reference: ${text(item.storage_reference) || "UNKNOWN"}`);
    if (text(item.review_url)) {
      console.log(`Review URL: ${item.review_url}`);
    }

    const listened = text(await rl.question("Have you listened to the complete review audio? Type YES to continue: ")).toUpperCase();
    if (listened !== "YES") {
      throw new Error(`AVANTIQO_MUSIC_HUMAN_REVIEW_LISTENING_REQUIRED:run=${item.run ?? "UNKNOWN"}`);
    }

    const criteria = Array.isArray(item.criteria) ? item.criteria : [];
    if (!criteria.length) throw new Error(`AVANTIQO_MUSIC_HUMAN_REVIEW_CRITERIA_REQUIRED:run=${item.run ?? "UNKNOWN"}`);

    let total = 0;
    let criteriaPass = true;
    for (const criterion of criteria) {
      const minimum = Number(criterion.minimum_score);
      console.log(`\n${criterion.label || criterion.criterion}`);
      if (text(criterion.guidance)) console.log(`Guidance: ${criterion.guidance}`);
      const score = await askScore(rl, criterion.label || criterion.criterion, minimum);
      const note = await askRequired(rl, "Short evidence note: ", 8);
      const passed = Number.isFinite(minimum) && score >= minimum;
      criterion.score_0_100 = score;
      criterion.evidence_note = note;
      criterion.status = passed ? "PASS" : "FAIL";
      total += score;
      criteriaPass = criteriaPass && passed;
    }

    const average = total / criteria.length;
    const requiredAverage = Number(review.minimum_average_score || 90);
    const itemPass =
      item.technical_benchmark_passed === true &&
      item.ace_step_lm_used === true &&
      item.thinking_enabled === true &&
      criteriaPass &&
      average >= requiredAverage;

    item.review_status = itemPass ? "PASS" : "FAIL";
    item.reviewer = reviewer;
    item.reviewed_at = reviewedAt;
    item.notes = await rl.question("Optional overall note: ");
    item.human_review_average_score = Number(average.toFixed(2));
    allItemsPass = allItemsPass && itemPass;

    console.log(`Run ${item.run ?? "UNKNOWN"} average: ${average.toFixed(2)} / required ${requiredAverage}`);
    console.log(`Run review status: ${item.review_status}`);
  }

  const overallStatus = allItemsPass ? "PASS" : "FAIL";
  console.log(`\nOverall human review result: ${overallStatus}`);
  const confirm = text(await rl.question("Type YES to record these human scores exactly as entered: ")).toUpperCase();
  if (confirm !== "YES") {
    throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_RECORD_CONFIRMATION_REQUIRED");
  }

  review.reviewer = reviewer;
  review.reviewed_at = reviewedAt;
  review.review_status = overallStatus;
  review.items = items;
  review.automatic_human_approval_forbidden = true;
  review.activation_allowed = false;
  review.human_review_recorded_interactively = true;
  review.production_deploy_performed = false;
  review.pricing_activation_performed = false;

  await writeFile(OUTPUT, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    success: true,
    output_path: OUTPUT,
    contract: REVIEW_CONTRACT,
    reviewer,
    reviewed_at: reviewedAt,
    review_status: overallStatus,
    runs: items.length,
    activation_allowed: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
  }, null, 2));
} finally {
  rl.close();
}
