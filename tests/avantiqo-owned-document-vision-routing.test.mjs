import assert from 'node:assert/strict';
import test from 'node:test';

import { ownedProviderForCapability } from '../lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js';
import { ownedModelCertification } from '../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js';

test('document vision capabilities are bound to Avantiqo Image', () => {
  for (const capability of ['ai.image.analyze', 'document.ocr', 'document.classify']) {
    assert.equal(ownedProviderForCapability(capability), 'avantiqo-image');
  }
});

test('Qwen VL certifies owned OCR and classification', () => {
  const provider = {
    id: 'avantiqo-image',
    metadata: { foundation_models: ['Qwen/Qwen2.5-VL-7B-Instruct'] },
  };
  for (const capability of ['ai.image.analyze', 'document.ocr', 'document.classify']) {
    const result = ownedModelCertification({ provider, capability });
    assert.equal(result.eligible, true);
    assert.deepEqual(result.approved_models, ['Qwen/Qwen2.5-VL-7B-Instruct']);
  }
});
