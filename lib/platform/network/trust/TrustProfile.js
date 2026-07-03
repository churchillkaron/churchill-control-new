export function createTrustProfile({
  verified = false,
  licenses = [],
  insurance = [],
  certificates = [],
  score = 0,
}) {
  return {
    verified,
    licenses,
    insurance,
    certificates,
    score,
  };
}
