// Which selected assets carry no rights or consent record.
//
// The director receives rights, consent and restrictions per asset and is told not to invent any of
// them, which is right. What it was never told is which assets have nothing on file. That left it
// with two losing options on a venue shoot where every asset carries usage rights and none carries
// a consent record: assert verified rights it cannot evidence, or say nothing and be rejected by the
// rights reviewer for exactly that silence. rights-safety-director scored a plan 88 against a floor
// of 90 on "release without proper usage rights and verified contractual" while the plan was
// otherwise passing five other disciplines.
//
// Naming the gap is not the same as filling it. Nothing here asserts a right, grants a consent or
// invents a licence. It states what is on file so the plan can carry an honest rights position --
// which is what the reviewer is actually looking for, and what a producer would write.

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function record(asset, field) {
  const direct = asset?.[field];
  const nested = asset?.metadata?.[field];
  const value = direct && Object.keys(direct).length ? direct : nested;
  return value && typeof value === "object" && Object.keys(value).length ? value : null;
}

export function rightsEvidenceGap(assets = []) {
  const missingRights = [];
  const missingConsent = [];

  for (const asset of list(assets)) {
    const id = text(asset?.asset_id || asset?.id);
    if (!id) continue;
    if (!record(asset, "rights")) missingRights.push(id);
    // Consent is the record that matters wherever a person is identifiable, so it is reported
    // separately rather than folded into a single rights flag -- the two call for different
    // statements in the plan.
    if (!record(asset, "consent")) missingConsent.push(id);
  }

  return {
    assets_without_rights_record: missingRights,
    assets_without_consent_record: missingConsent,
  };
}

export default rightsEvidenceGap;
