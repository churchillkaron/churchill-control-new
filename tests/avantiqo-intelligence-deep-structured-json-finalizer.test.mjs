import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("services/avantiqo-intelligence-modal/modal_app.py", "utf8");

test("owned Deep Intelligence preserves reasoning then enforces JSON only when needed", () => {
  assert.match(source, /StructuredOutputsParams\(json_object=True\)/);
  assert.match(source, /if json_object_required and _json_object\(final_text\) is None:/);
  assert.match(source, /AVANTIQO_DEEP_REASON_THEN_STRUCTURED_JSON_V1/);
  assert.match(source, /structured_json_finalization_performed/);
});

test("structured finalization usage is included in governed token accounting", () => {
  assert.match(source, /len\(request_output\.prompt_token_ids or \[\]\) \+ structured_input_tokens/);
  assert.match(source, /len\(generated\.token_ids or \[\]\) \+ structured_output_tokens/);
  assert.match(source, /unsupported facts, new creative claims or new evidence/);
});
