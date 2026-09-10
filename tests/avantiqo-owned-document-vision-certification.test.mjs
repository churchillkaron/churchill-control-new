import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const benchmark = readFileSync('scripts/benchmark-avantiqo-document-vision.mjs', 'utf8');
const modalApp = readFileSync('services/avantiqo-image-engine/modal_app.py', 'utf8');

test('document vision benchmark proves all owned analysis semantics', () => {
  for (const capability of ['ai.image.analyze', 'document.ocr', 'document.classify']) {
    assert.match(benchmark, new RegExp(capability.replaceAll('.', '\\.')));
  }
  assert.match(benchmark, /activation_allowed:\s*false/);
  assert.match(benchmark, /pricing_activation_performed:\s*false/);
});

test('Modal image volume seeds the owned Qwen VL model offline', () => {
  assert.match(modalApp, /Qwen\/Qwen2\.5-VL-7B-Instruct/);
  assert.match(modalApp, /_seed_one_model\(ANALYZE_MODEL/);
  assert.match(modalApp, /AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES/);
});

test('document vision certification remains separate from retired RunPod suite', () => {
  assert.match(benchmark, /AVANTIQO_DOCUMENT_VISION_CERTIFICATION_V1/);
  assert.match(modalApp, /runpod_inference_performed.*False/);
});
