import { execute } from "@/lib/ubte";

export async function POST(req) {
  const body = await req.json();

  return execute({
    capability: body.capability,
    context: body.context,
    payload: body.payload
  });
}
