export function resolveAISkills(config = {}) {
  return config.ai || config.aiSkills || [];
}
