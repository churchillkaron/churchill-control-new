import { execute } from "@/lib/ubte";

export async function POST(req) {
  const body = await req.json();

  return execute({
    capability: "creative.rendering",
    context: body,
    payload: body
  });
}
