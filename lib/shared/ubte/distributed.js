/**
 * UBTE DISTRIBUTED STATE LAYER
 * Future Redis-ready abstraction
 * (currently memory fallback safe mode)
 */

let redisClient = null;

/**
 * OPTIONAL: attach redis later
 */
export function setRedisClient(client) {
  redisClient = client;
}

/**
 * SAFE GET/SET abstraction
 */
export async function setState(key, value, ttl = 60) {
  if (redisClient) {
    await redisClient.set(key, JSON.stringify(value), "EX", ttl);
  } else {
    global.__UBTE_STATE__ = global.__UBTE_STATE__ || {};
    global.__UBTE_STATE__[key] = value;
  }
}

export async function getState(key) {
  if (redisClient) {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  }

  return global.__UBTE_STATE__?.[key] || null;
}

export async function deleteState(key) {
  if (redisClient) {
    await redisClient.del(key);
  } else {
    if (global.__UBTE_STATE__) {
      delete global.__UBTE_STATE__[key];
    }
  }
}
