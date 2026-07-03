export function resolveSearchFields(config = {}) {
  return config.search || config.searchFields || [];
}
