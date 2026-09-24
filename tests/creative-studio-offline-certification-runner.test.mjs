import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const certifier = read("scripts/certify-creative-studio-visual-readiness.mjs");
const analyzer = read("scripts/analyze-creative-cinematic-references.mjs");
const pkg = JSON.parse(read("package.json"));

test("Studio visual certification is zero-generation and fail-closed on real reference evidence", () => {
  for (const source of [certifier, analyzer]) {
    assert.doesNotMatch(source, /runAIService|executeProvider\s*\(|\.execute\s*\(.*ai\.video|image_gen/i);
    assert.match(source, /provider_calls_executed:\s*0/);
    assert.match(source, /media_generation_executed:\s*0/);
  }
  assert.match(analyzer, /measurements_verified:\s*measurementsVerified/);
  assert.match(analyzer, /references\.every\(\(item\) => item\.available === true\)/);
  assert.match(certifier, /referenceBenchmark\.references\.length >= 5/);
  assert.match(certifier, /\(referenceMeasured \|\| storyboardMeasured\) && authoredGrammar\.passed/);
  assert.match(certifier, /five-reference full measured benchmark artifact verified/);
  assert.match(certifier, /five-reference public visual storyboard benchmark verified for visual-generation readiness; full-reference audio measurement remains a final sound\/master gate/);
});

test("npm readiness certification measures references before issuing certification", () => {
  assert.equal(pkg.scripts["analyze:creative-cinematic-references"], "node scripts/analyze-creative-cinematic-references.mjs");
  assert.match(pkg.scripts["certify:creative-studio-visual-readiness"], /^npm run analyze:creative-cinematic-references && node --loader \.\/scripts\/next-alias-loader\.mjs /);
});
