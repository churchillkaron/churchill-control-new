import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const sourcePath = path.join(
    process.cwd(),
    "public",
    "branding",
    "avantiqo-logo.webp.b64",
  );

  const encoded = (await readFile(sourcePath, "utf8")).trim();
  const image = Buffer.from(encoded, "base64");

  return new Response(image, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
