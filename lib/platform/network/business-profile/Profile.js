export function createBusinessProfile({
  id,
  organization_id,
  legal_name,
  display_name,
  country,
  industry,
  capabilities = [],
  channels = [],
  trust = {},
}) {
  return {
    id,
    organization_id,
    legal_name,
    display_name,
    country,
    industry,
    capabilities,
    channels,
    trust,
  };
}
