// Which assets cannot be cleared for release, and exactly what each one is missing.
//
// The studio reads rights and consent per asset, refuses to certify work whose evidence it cannot see,
// and has no surface anywhere for recording either. So the benchmark's rights reviewer scores a plan 70
// and blocks it -- correctly, because consent is recorded on none of the assets -- and there was no way
// to find out which assets those were without querying the database by hand.
//
// This reports the gap and nothing else. It asserts no right, grants no consent, writes nothing and
// fabricates nothing: those values come from real clearance documents and belong to whoever holds them.
// The point is to turn "the rights reviewer is unhappy" into a list of assets and fields somebody can
// actually work through.
//
// Read-only. Safe to run against production.
//
//   node --loader ./scripts/next-alias-loader.mjs scripts/creative-rights-consent-worklist.mjs
//   CREATIVE_RIGHTS_ORGANIZATION_ID=<uuid> node --loader ... (one organization)
//   CREATIVE_RIGHTS_LIMIT=200 node --loader ...

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION = String(process.env.CREATIVE_RIGHTS_ORGANIZATION_ID || "").trim();
const LIMIT = Number(process.env.CREATIVE_RIGHTS_LIMIT || 500);

// The fields CreativeReleaseGateRuntime.assetCheck actually inspects. Kept in this shape so the report
// names the same things the gate will fail on rather than a paraphrase of them.
const RIGHTS_SHAPE = {
  status: 'must be "CLEARED"',
  evidence_id: "or document_id: the clearance record this claim rests on",
  usage: "array covering the intended usage, e.g. paid advertising",
  channels: "array of channels the licence covers",
  territories: "array of territories the licence covers",
  valid_until: "ISO date still in the future",
};

const CONSENT_SHAPE = {
  status: 'must be "GRANTED"',
  evidence_id: "or document_id: the signed release this consent rests on",
  valid_until: "ISO date still in the future",
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function missingFields(record, shape) {
  const present = object(record);
  const missing = [];
  for (const field of Object.keys(shape)) {
    if (field === "evidence_id") {
      if (!present.evidence_id && !present.document_id) missing.push("evidence_id or document_id");
      continue;
    }
    const value = present[field];
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
      missing.push(field);
    }
  }
  return missing;
}

function statusWrong(record, field, expected) {
  const value = String(object(record)[field] ?? "").trim().toUpperCase();
  return value && value !== expected ? value : null;
}

function expired(record) {
  const until = object(record).valid_until;
  if (!until) return false;
  const parsed = Date.parse(until);
  return Number.isFinite(parsed) && parsed <= Date.now();
}

async function main() {
  let query = supabaseAdmin
    .from("creative_assets")
    .select("id,name,file_name,asset_type,organization_id,metadata,ai_generated,status")
    .limit(LIMIT);
  if (ORGANIZATION) query = query.eq("organization_id", ORGANIZATION);

  const { data, error } = await query;
  if (error) throw error;

  // Generated assets are the studio's own output and carry the rights of whatever produced them; the
  // clearance question is about supplied source material.
  const assets = list(data).filter((asset) => asset.ai_generated !== true);

  console.log("============================================================");
  console.log("CREATIVE RIGHTS AND CONSENT WORKLIST");
  console.log("============================================================");
  console.log("WRITES_EXECUTED=NO");
  console.log(`SOURCE_ASSETS_EXAMINED=${assets.length}`);
  if (ORGANIZATION) console.log(`ORGANIZATION=${ORGANIZATION}`);

  const byOrganization = new Map();
  for (const asset of assets) {
    const key = asset.organization_id || "unknown";
    if (!byOrganization.has(key)) byOrganization.set(key, []);
    byOrganization.get(key).push(asset);
  }

  let totalRights = 0;
  let totalConsent = 0;

  for (const [organizationId, group] of byOrganization) {
    const rightsGaps = [];
    const consentGaps = [];

    for (const asset of group) {
      const metadata = object(asset.metadata);
      const rights = object(metadata.rights || metadata.licence);
      const consent = object(metadata.consent);

      const rightsMissing = missingFields(rights, RIGHTS_SHAPE);
      const rightsStatus = statusWrong(rights, "status", "CLEARED");
      if (rightsMissing.length || rightsStatus || expired(rights)) {
        rightsGaps.push({
          asset,
          missing: rightsMissing,
          status: rightsStatus,
          expired: expired(rights),
          empty: !Object.keys(rights).length,
        });
      }

      const consentMissing = missingFields(consent, CONSENT_SHAPE);
      const consentStatus = statusWrong(consent, "status", "GRANTED");
      if (consentMissing.length || consentStatus || expired(consent)) {
        consentGaps.push({
          asset,
          missing: consentMissing,
          status: consentStatus,
          expired: expired(consent),
          empty: !Object.keys(consent).length,
        });
      }
    }

    totalRights += rightsGaps.length;
    totalConsent += consentGaps.length;

    console.log(`\n------------------------------------------------------------`);
    console.log(`ORGANIZATION ${organizationId}`);
    console.log(`  source assets: ${group.length}`);
    console.log(`  missing or incomplete rights : ${rightsGaps.length}`);
    console.log(`  missing or incomplete consent: ${consentGaps.length}`);

    for (const [label, gaps] of [["RIGHTS", rightsGaps], ["CONSENT", consentGaps]]) {
      if (!gaps.length) continue;
      const wholly = gaps.filter((gap) => gap.empty);
      const partial = gaps.filter((gap) => !gap.empty);
      console.log(`\n  ${label}: ${wholly.length} with no record at all, ${partial.length} incomplete`);
      for (const gap of partial.slice(0, 25)) {
        const name = gap.asset.name || gap.asset.file_name || "(unnamed)";
        const notes = [
          gap.missing.length ? `missing ${gap.missing.join(", ")}` : null,
          gap.status ? `status is ${gap.status}` : null,
          gap.expired ? "expired" : null,
        ].filter(Boolean).join("; ");
        console.log(`     ${gap.asset.id}  ${String(name).slice(0, 40).padEnd(40)} ${notes}`);
      }
      if (wholly.length) {
        console.log(`     ${wholly.length} asset id(s) with no ${label.toLowerCase()} record:`);
        for (const gap of wholly.slice(0, 40)) {
          const name = gap.asset.name || gap.asset.file_name || "(unnamed)";
          console.log(`       ${gap.asset.id}  ${String(name).slice(0, 50)}`);
        }
        if (wholly.length > 40) console.log(`       ... and ${wholly.length - 40} more`);
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`ASSETS_NEEDING_RIGHTS=${totalRights}`);
  console.log(`ASSETS_NEEDING_CONSENT=${totalConsent}`);
  console.log("");
  console.log("The release gate reads these from creative_assets.metadata. Required shape:");
  console.log("  metadata.rights  =", JSON.stringify(RIGHTS_SHAPE, null, 2).replace(/\n/g, "\n                     "));
  console.log("  metadata.consent =", JSON.stringify(CONSENT_SHAPE, null, 2).replace(/\n/g, "\n                     "));
  console.log("");
  console.log("Consent applies where a person is identifiable. An asset with no identifiable person");
  console.log("needs rights rather than consent, and the policy that governs a given release decides");
  console.log("which of the two it demands -- require_rights_evidence and require_consent.");
  console.log("");
  console.log("These values come from real clearance documents. Nothing should be entered here that is");
  console.log("not backed by one.");
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
