import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCreativeFloorExecutionRuntime.js", "utf8");

test("Music creative floor batches all specialist critics per concept without merging their judgements", () => {
  assert.match(source, /MUSIC_STUDIO_CRITIC_PANEL/);
  assert.match(source, /evaluate_each_critic_independently: true/);
  assert.match(source, /do_not_average_or_merge_critic_judgements: true/);
  assert.match(source, /return_exactly_one_review_per_critic: true/);
  assert.match(source, /criticReviews\.push\(\.\.\.await criticPanel/);
  assert.doesNotMatch(source, /for \(const criticSpec of development\.concept_competition\.critics\)/);
});

test("Music critic panel fails closed when any required critic review is absent", () => {
  assert.match(source, /CREATIVE_MUSIC_CRITIC_REVIEW_MISSING/);
  assert.match(source, /critic_id: criticSpec\.id/);
  assert.match(source, /concept_id: conceptRow\.id/);
});


test("isolated Music quality worker can extend Deep keep-warm without changing production default", () => {
  const modal = fs.readFileSync("services/avantiqo-intelligence-modal/modal_app.py", "utf8");
  assert.match(modal, /AVANTIQO_INTELLIGENCE_DEEP_SCALEDOWN_SECONDS/);
  assert.match(modal, /\"5\"/);
});
