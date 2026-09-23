import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const dock = fs.readFileSync("components/operator/HomeAvantiqoIntelligenceDock.jsx", "utf8");
const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("Business Partner attachments bind directly to its exact live turn without global fetch interception", () => {
  parse(dock, { sourceType: "module", plugins: ["jsx"] });
  parse(home, { sourceType: "module", plugins: ["jsx"] });
  assert.match(dock, /async function prepareAttachmentSetForTurn\(\)/);
  assert.match(dock, /developerAttachmentAnalysisPromiseRef\.current/);
  assert.match(dock, /prepareAttachmentSetForTurn=\{prepareAttachmentSetForTurn\}/);
  assert.match(home, /const turnAttachmentSetId = typeof prepareAttachmentSetForTurn === "function"/);
  assert.match(home, /"x-avantiqo-attachment-set": turnAttachmentSetId/);
  assert.doesNotMatch(dock, /window\.fetch =/);
  assert.doesNotMatch(dock, /transparentBusinessPartnerFetch/);
});

test("selected attachments clear only after the exact Business Partner turn succeeds", () => {
  assert.match(dock, /function completeAttachmentTurn\(attachmentSetId\)/);
  assert.match(dock, /developerAttachmentSetRef\.current\?\.attachment_set_id/);
  assert.match(home, /completeAttachmentTurn\(turnAttachmentSetId\)/);
  assert.ok(home.indexOf("const responseText = text(decision?.response_text)") < home.indexOf("completeAttachmentTurn(turnAttachmentSetId)"));
});
