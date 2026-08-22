import assert from "node:assert/strict";
import { needsOwnedCognitiveBrief } from "../lib/operator/runtime/OperatorOwnedCognitiveBriefPolicy.js";

assert.equal(needsOwnedCognitiveBrief({ source: "voice", message: "what strategy should we use?" }), false);
assert.equal(needsOwnedCognitiveBrief({ message: "what is revenue today?" }), false);
assert.equal(needsOwnedCognitiveBrief({ message: "show current sales status" }), false);
assert.equal(needsOwnedCognitiveBrief({ message: "what is the current finance balance?" }), false);
assert.equal(needsOwnedCognitiveBrief({ message: "what should we do about declining margin?" }), true);
assert.equal(needsOwnedCognitiveBrief({ message: "compare these options and recommend the best way" }), true);
assert.equal(needsOwnedCognitiveBrief({ message: "debug why this workflow keeps failing" }), true);
assert.equal(needsOwnedCognitiveBrief({ message: "challenge this plan and identify the biggest risk" }), true);
assert.equal(needsOwnedCognitiveBrief({ message: `${"status data ".repeat(60)}` }), false);
assert.equal(needsOwnedCognitiveBrief({ message: `${"project constraints and plan options ".repeat(20)}` }), true);

console.log("PASS avantiqo owned cognitive brief latency policy");
