const listeners = {}

export function registerEvent(
  event,
  handler
) {

  if (!listeners[event]) {
    listeners[event] = []
  }

  listeners[event].push(handler)
}

export async function emitEvent(
  event,
  payload = {}
) {

  const handlers =
    listeners[event] || []

  const results = []

  for (const handler of handlers) {

    try {

      const result =
        await handler(payload)

      results.push({
        success: true,
        result,
      })

    } catch (error) {

      console.error(
        `Event handler failed for ${event}`,
        error
      )

      results.push({
        success: false,
        error:
          error.message,
      })
    }
  }

  return results
}
