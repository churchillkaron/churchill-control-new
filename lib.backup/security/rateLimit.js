const memoryStore = new Map();

export default function rateLimit({
  key,
  limit = 60,
  windowMs = 60000,
}) {

  const now = Date.now();

  const current =
    memoryStore.get(key);

  if (!current) {

    memoryStore.set(key, {
      count: 1,
      expires:
        now + windowMs,
    });

    return {
      allowed: true,
      remaining:
        limit - 1,
    };
  }

  if (
    now >
    current.expires
  ) {

    memoryStore.set(key, {
      count: 1,
      expires:
        now + windowMs,
    });

    return {
      allowed: true,
      remaining:
        limit - 1,
    };
  }

  if (
    current.count >= limit
  ) {

    return {
      allowed: false,
      retryAfter:
        current.expires -
        now,
    };
  }

  current.count += 1;

  memoryStore.set(
    key,
    current
  );

  return {
    allowed: true,
    remaining:
      limit -
      current.count,
  };
}
