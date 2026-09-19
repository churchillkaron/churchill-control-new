import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const council=fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');
const workflow=fs.readFileSync('lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js','utf8');

test('concept council exports the canonical rejected-lineage detector for replay validation',()=>{
  assert.match(council,/REJECTED_CREATIVE_FAMILIES/);
  assert.match(council,/PROPAGATING_SIGNAL_OR_CONNECTIVE_PROXY/);
  assert.match(council,/"pulse".*"ripple".*"network"/s);
  assert.match(council,/rejectedLineageCollision\(concept = \{\}, \{ project = null, rejectedCreativeLineage = null \} = \{\}\)/);
  assert.match(council,/list\(project\?\.metadata\?\.rejected_direction_history\)/);
});

test('challenger checkpoint is rejected before replay when it collides with rejected lineage',()=>{
  assert.match(workflow,/function rejectedCheckpointCollision/);
  assert.match(workflow,/const challengerConcept = \{/);
  assert.match(workflow,/if \(rejectedCheckpointCollision\(project, challengerConcept\)\) return null/);
});

test('temporal direction checkpoint is rejected before replay when selected concept collides',()=>{
  assert.match(workflow,/const selectedConcept = object\(/);
  assert.match(workflow,/selection\.selected_concept/);
  assert.match(workflow,/master\.plan\?\.concept/);
  assert.match(workflow,/if \(rejectedCheckpointCollision\(project, selectedConcept\)\) return null/);
});

test('fresh selector also retains post-selection rejected-lineage veto',()=>{
  assert.match(council,/CREATIVE_EXECUTIVE_CONCEPT_SELECTION_REJECTED_LINEAGE/);
  assert.match(council,/const selectedLineageCollision = rejectedLineageCollision\(selectedConcept, context\)/);
});
