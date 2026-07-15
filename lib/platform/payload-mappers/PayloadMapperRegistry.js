const REGISTRY = {};

export function registerPayloadMapper(
  name,
  mapper,
) {

  if (!name || !mapper) {
    return;
  }

  REGISTRY[name] = mapper;

}

export function resolvePayloadMapper(name) {

  if (!name) {
    return null;
  }

  return REGISTRY[name] || null;

}
