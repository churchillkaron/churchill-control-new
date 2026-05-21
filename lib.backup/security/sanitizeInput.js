export default function sanitizeInput(
  input
) {

  if (
    typeof input !==
    "string"
  ) {
    return input;
  }

  return input
    .replace(
      /<script.*?>.*?<\/script>/gi,
      ""
    )
    .replace(
      /[<>]/g,
      ""
    )
    .trim();
}
