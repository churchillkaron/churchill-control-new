// Record rights and consent that already exist on paper, against the assets they cover.
//
// The studio reads rights and consent per asset, blocks release without them, and had nowhere to record
// either -- so a tribunal rights reviewer scored a plan 70 and no amount of creative work could move it.
// The worklist script names which assets are short. This one writes what you tell it.
//
// It invents nothing. Every value comes from a file you supply, describing clearance documents that
// exist. There is no default status, no assumed territory, no inferred expiry, and nothing is written for
// an asset whose record is incomplete: a half-filled clearance is worse than an absent one, because the
// gate would pass it.
//
// Dry run unless CREATIVE_RIGHTS_APPLY=YES. The dry run reads the current value of every asset it would
// touch and shows what would change, so an overwrite is a decision rather than an accident.
//
//   CREATIVE_RIGHTS_INPUT=./clearances.json \
//     node --loader ./scripts/next-alias-loader.mjs scripts/creative-rights-consent-record.mjs
//
//   CREATIVE_RIGHTS_INPUT=./clearances.json CREATIVE_RIGHTS_APPLY=YES \
//     node --loader ./scripts/next-alias-loader.mjs scripts/creative-rights-consent-record.mjs
//
// Input shape. Omit either block for an asset it does not apply to -- an asset with no identifiable
// person needs rights and not consent, and saying so by omission is correct:
//
//   {
//     "recorded_by": "who is entering these, for the audit trail",
//     "assets": {
//       "<asset uuid>": {
//         "rights": {
//           "status": "CLEARED",
//           "document_id": "the licence or agreement this rests on",
//           "usage": ["PAID_ADVERTISING", "ORGANIC_SOCIAL"],
//           "channels": ["INSTAGRAM", "FACEBOOK"],
//           "territories": ["TH", "GLOBAL"],
//           "valid_until": "2027-12-31"
//         },
//         "consent": {
//           "status": "GRANTED",
//           "document_id": "the signed release this rests on",
//           "valid_until": "2027-12-31"
//         }
//       }
//     }
//   }

import fs from "node:fs";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const INPUT = String(process.env.CREATIVE_RIGHTS_INPUT || "").trim();
const APPLY = String(process.env.CREATIVE_RIGHTS_APPLY || "").trim().toUpperCase() === "YES";

// Exactly what CreativeReleaseGateRuntime.assetCheck inspects. A record that does not satisfy these is
// refused rather than written, because the gate reads what is stored and cannot know it was a guess.
const RIGHTS_REQUIRED = ["status", "usage", "channels", "territories", "valid_until"];
const CONSENT_REQUIRED = ["status", "valid_until"];

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function futureDate(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) && parsed > Date.now();
}

function validateRights(record) {
  const problems = [];
  const rights = object(record);
  if (text(rights.status).toUpperCase() !== "CLEARED") {
    problems.push('status must be exactly "CLEARED"');
  }
  if (!text(rights.evidence_id) && !text(rights.document_id)) {
    problems.push("evidence_id or document_id is required: name the document this rests on");
  }
  for (const field of ["usage", "channels", "territories"]) {
    if (!list(rights[field]).length) problems.push(`${field} must list at least one value`);
  }
  if (!futureDate(rights.valid_until)) {
    problems.push("valid_until must be a date in the future");
  }
  for (const field of Object.keys(rights)) {
    if (![...RIGHTS_REQUIRED, "evidence_id", "document_id", "notes", "holder"].includes(field)) {
      problems.push(`${field} is not a field the release gate reads`);
    }
  }
  return problems;
}

function validateConsent(record) {
  const problems = [];
  const consent = object(record);
  if (text(consent.status).toUpperCase() !== "GRANTED") {
    problems.push('status must be exactly "GRANTED"');
  }
  if (!text(consent.evidence_id) && !text(consent.document_id)) {
    problems.push("evidence_id or document_id is required: name the signed release this rests on");
  }
  if (!futureDate(consent.valid_until)) {
    problems.push("valid_until must be a date in the future");
  }
  for (const field of Object.keys(consent)) {
    if (![...CONSENT_REQUIRED, "evidence_id", "document_id", "notes", "subject"].includes(field)) {
      problems.push(`${field} is not a field the release gate reads`);
    }
  }
  return problems;
}

function describe(record) {
  if (!Object.keys(object(record)).length) return "absent";
  const parts = [text(record.status) || "no status"];
  const evidence = text(record.evidence_id) || text(record.document_id);
  parts.push(evidence ? `evidence ${evidence}` : "no evidence");
  if (record.valid_until) parts.push(`until ${text(record.valid_until)}`);
  return parts.join(", ");
}

async function main() {
  if (!INPUT) throw new Error("CREATIVE_RIGHTS_INPUT_REQUIRED");
  if (!fs.existsSync(INPUT)) throw new Error(`CREATIVE_RIGHTS_INPUT_NOT_FOUND:${INPUT}`);

  const payload = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const recordedBy = text(payload.recorded_by);
  const entries = Object.entries(object(payload.assets));

  console.log("============================================================");
  console.log("CREATIVE RIGHTS AND CONSENT RECORDING");
  console.log("============================================================");
  console.log(`MODE=${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`INPUT=${INPUT}`);
  console.log(`ASSETS_IN_INPUT=${entries.length}`);

  if (!recordedBy) throw new Error("CREATIVE_RIGHTS_RECORDED_BY_REQUIRED");
  if (!entries.length) throw new Error("CREATIVE_RIGHTS_NO_ASSETS_IN_INPUT");

  const ids = entries.map(([id]) => text(id)).filter(Boolean);
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,name,file_name,organization_id,metadata")
    .in("id", ids);
  if (error) throw error;

  const existing = new Map(list(data).map((asset) => [text(asset.id), asset]));

  const planned = [];
  const refused = [];

  for (const [assetId, record] of entries) {
    const id = text(assetId);
    const asset = existing.get(id);
    if (!asset) {
      // An id that does not resolve is refused rather than inserted. Recording a clearance against an
      // asset that does not exist is how a phantom asset ends up looking cleared.
      refused.push({ id, problems: ["no asset with this id exists"] });
      continue;
    }

    const problems = [];
    const rights = object(record.rights);
    const consent = object(record.consent);
    if (!Object.keys(rights).length && !Object.keys(consent).length) {
      problems.push("neither a rights nor a consent block was supplied");
    }
    if (Object.keys(rights).length) problems.push(...validateRights(rights).map((p) => `rights: ${p}`));
    if (Object.keys(consent).length) problems.push(...validateConsent(consent).map((p) => `consent: ${p}`));

    if (problems.length) {
      refused.push({ id, name: asset.name || asset.file_name, problems });
      continue;
    }

    planned.push({ id, asset, rights, consent });
  }

  if (refused.length) {
    console.log(`\nREFUSED=${refused.length}`);
    for (const entry of refused) {
      console.log(`  ${entry.id}  ${entry.name || ""}`);
      for (const problem of entry.problems) console.log(`     ${problem}`);
    }
  }

  console.log(`\nWOULD_RECORD=${planned.length}`);
  for (const entry of planned) {
    const metadata = object(entry.asset.metadata);
    const currentRights = object(metadata.rights || metadata.licence);
    const currentConsent = object(metadata.consent);
    console.log(`  ${entry.id}  ${entry.asset.name || entry.asset.file_name || ""}`);
    if (Object.keys(entry.rights).length) {
      console.log(`     rights : ${describe(currentRights)}  ->  ${describe(entry.rights)}`);
    }
    if (Object.keys(entry.consent).length) {
      console.log(`     consent: ${describe(currentConsent)}  ->  ${describe(entry.consent)}`);
    }
  }

  if (!APPLY) {
    console.log("\nWRITES_EXECUTED=NO");
    console.log("Set CREATIVE_RIGHTS_APPLY=YES to record these. Read the changes above first: an existing");
    console.log("record shown on the left will be replaced.");
    return;
  }

  if (refused.length) {
    // All or nothing on a governance surface. Writing the valid half of a clearance batch leaves the
    // organization unable to tell which assets were entered and which were skipped.
    throw new Error(`CREATIVE_RIGHTS_REFUSED_ENTRIES_PRESENT:${refused.length}`);
  }

  let written = 0;
  for (const entry of planned) {
    const metadata = object(entry.asset.metadata);
    const next = { ...metadata };
    const recordedAt = new Date().toISOString();

    if (Object.keys(entry.rights).length) {
      next.rights = { ...entry.rights, recorded_by: recordedBy, recorded_at: recordedAt };
    }
    if (Object.keys(entry.consent).length) {
      next.consent = { ...entry.consent, recorded_by: recordedBy, recorded_at: recordedAt };
    }

    const { error: writeError } = await supabaseAdmin
      .from("creative_assets")
      .update({ metadata: next })
      .eq("id", entry.id);
    if (writeError) throw writeError;
    written += 1;
  }

  console.log(`\nWRITES_EXECUTED=YES`);
  console.log(`ASSETS_RECORDED=${written}`);
  console.log(`RECORDED_BY=${recordedBy}`);
  console.log("\nRe-run scripts/creative-rights-consent-worklist.mjs to confirm the gaps have closed.");
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
