#!/usr/bin/env node

import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const intent = process.argv.slice(2).join(" ").trim();
if (!intent) process.exit(0);

const [
  { supabaseAdmin },
  { CreativeMissionRuntime },
  CreativeProjectRepository,
  { CreativeProjectRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(value) {
  const ignored = new Set([
    "and", "bar", "co", "company", "ltd", "limited", "restaurant", "the",
  ]);
  return normalized(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ignored.has(token));
}

async function resolveOrganization() {
  const explicit = text(
    process.env.CREATIVE_ORGANIZATION_ID ||
    process.env.ACTIVE_ORGANIZATION_ID ||
    process.env.ORGANIZATION_ID,
  );
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .limit(1000);
  if (error) throw error;

  const organizations = (data || []).filter((item) => item?.id && item?.name);
  if (explicit) {
    return organizations.find((item) => text(item.id) === explicit) || null;
  }

  const command = normalized(intent);
  return organizations
    .map((organization) => {
      const name = normalized(organization.name);
      const tokens = significantTokens(organization.name);
      let score = name && command.includes(name) ? 1000 : 0;
      for (const token of tokens) {
        if (new RegExp(`\\b${token}\\b`, "i").test(command)) score += 150;
      }
      return { organization, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.organization || null;
}

const organization = await resolveOrganization();
if (!organization) process.exit(0);

const missions = await CreativeMissionRuntime.list({
  organization_id: organization.id,
});
const command = normalized(intent);
const mission = (missions || [])
  .filter((item) => !["completed", "archived", "cancelled", "canceled"]
    .includes(text(item.status).toLowerCase()))
  .filter((item) => {
    const metadata = object(item.metadata);
    return normalized(metadata.original_intent) === command ||
      normalized(item.title) === command;
  })
  .sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;

if (!mission) process.exit(0);

const project = await CreativeProjectRepository.getByMission({
  organization_id: organization.id,
  creative_mission_id: mission.id,
});
if (!project) process.exit(0);

const approval = object(project.metadata?.paid_research_approval);
const status = text(approval.status).toUpperCase();
const completed = new Set([
  "COMPLETED",
  "COMPLETED_FROM_EXISTING_USAGE",
]);
const legacyOrFailed = approval.approved === true && (
  !status ||
  approval.retry_required === true ||
  [
    "VALIDATION_FAILED",
    "EXECUTION_FAILED",
    "APPROVED_COST_EXCEEDED",
  ].includes(status)
);

if (!legacyOrFailed || completed.has(status)) process.exit(0);

await CreativeProjectRuntime.update(project.id, {
  metadata: {
    ...(project.metadata || {}),
    paid_research_approval: {
      ...approval,
      approved: false,
      status: status || "LEGACY_ATTEMPT_CONSUMED",
      retry_required: true,
      invalidated_at: new Date().toISOString(),
      invalidation_reason: "PRIOR_RESEARCH_ATTEMPT_REQUIRES_NEW_EXPLICIT_APPROVAL",
    },
  },
});

console.log("RESEARCH_APPROVAL_RESET=YES");
console.log(`CREATIVE_MISSION_ID=${mission.id}`);
console.log(`CREATIVE_PROJECT_ID=${project.id}`);