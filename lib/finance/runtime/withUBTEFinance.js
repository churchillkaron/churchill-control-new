export function withUBTEFinance(fn) {
  return async (event) => {
    return await fn({
      ...event,
      payload: {
        ...event.payload,
        __ubte: true
      }
    });
  };
}
