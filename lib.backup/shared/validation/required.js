export function requireFields(data, fields = []) {
  for (const field of fields) {
    if (
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ""
    ) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
}