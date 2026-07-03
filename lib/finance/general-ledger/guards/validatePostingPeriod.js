export function validatePostingPeriod(postingDate) {
  const date = new Date(postingDate);
  const now = new Date();

  if (date > now) {
    throw new Error("INVALID POSTING: future date not allowed");
  }

  return true;
}
