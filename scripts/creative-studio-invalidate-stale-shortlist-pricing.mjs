#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const downloads = path.join(process.env.HOME || "", "Downloads");
const statePath =
  process.env.COLE_PREFLIGHT_STATE ||
  path.join(downloads, "COLE_LEY_PERSISTED_PREFLIGHT_STATE_V2.json");

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function main() {
  const raw = await fs.readFile(statePath, "utf8");
  const state = JSON.parse(raw);
  const estimate = state.shortlist?.cost_estimate || {};
  const storedPrice = finite(estimate.estimated_customer_price, 0);
  const storedCalls = finite(state.shortlist?.estimated_ai_calls, 0);
  const stale =
    !state.project_shortlist_identity ||
    estimate.ready !== true ||
    storedCalls <= 0 ||
    storedPrice <= 0;

  console.log("============================================================");
  console.log("CREATIVE SHORTLIST PRICING CHECKPOINT");
  console.log("============================================================");
  console.log(`STATE=${statePath}`);
  console.log(`MISSION_ID=${state.creative_mission_id || "MISSING"}`);
  console.log(`PROJECT_ID=${state.creative_project_id || "MISSING"}`);
  console.log(`STORED_PROJECT_SHORTLIST_IDENTITY=${state.project_shortlist_identity || "MISSING"}`);
  console.log(`STORED_ESTIMATED_AI_CALLS=${storedCalls}`);
  console.log(`STORED_ESTIMATED_CUSTOMER_PRICE=${storedPrice}`);
  console.log(`STALE_PRICING_CHECKPOINT=${stale ? "YES" : "NO"}`);

  if (!stale) {
    console.log("CHECKPOINT_INVALIDATED=NO");
    console.log("PROVIDER_CALLS=NO");
    console.log("WALLET_CHARGES=NO");
    console.log("PRODUCTION_STARTED=NO");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${statePath}.before-pricing-refresh-${stamp}`;
  await fs.copyFile(statePath, backupPath);

  const previous = {
    project_shortlist_identity: state.project_shortlist_identity || null,
    shortlist: state.shortlist || null,
    final_status: state.final_status || null,
  };

  delete state.project_shortlist_identity;
  delete state.shortlist;
  delete state.final_status;

  state.events = Array.isArray(state.events) ? state.events : [];
  state.events.push({
    at: new Date().toISOString(),
    type: "PROJECT_SHORTLIST_PRICING_CHECKPOINT_INVALIDATED",
    reason: "NON_POSITIVE_OR_INCOMPLETE_PRICING_ESTIMATE",
    previous,
  });
  state.updated_at = new Date().toISOString();

  await fs.writeFile(statePath, JSON.stringify(state, null, 2));

  console.log(`BACKUP=${backupPath}`);
  console.log("MISSION_PRESERVED=YES");
  console.log("PROJECT_PRESERVED=YES");
  console.log("SOURCE_CHECKPOINTS_PRESERVED=YES");
  console.log("REGISTERED_ASSETS_PRESERVED=YES");
  console.log("LOCAL_CANDIDATES_PRESERVED=YES");
  console.log("CHECKPOINT_INVALIDATED=YES");
  console.log("PROVIDER_CALLS=NO");
  console.log("WALLET_CHARGES=NO");
  console.log("PRODUCTION_STARTED=NO");
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
